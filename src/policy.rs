use url::Url;

#[derive(Debug, PartialEq, Eq)]
pub enum PolicyError {
    InvalidUrl,
    DangerousScheme,
    NavigationDisallowed,
    OpenExternalFailed(String),
}

pub struct PolicyEngine;

impl PolicyEngine {
    /// Kiểm tra xem URL có thuộc phạm vi ứng dụng nội bộ (Messenger / Workplace / 2FA checkpoint)
    pub fn is_internal_url(url: &Url) -> bool {
        if url.scheme() != "https" {
            return false;
        }

        let host_str = match url.host_str() {
            Some(h) => h,
            None => return false,
        };

        // 1. Messenger domains: messenger.com hoặc *.messenger.com
        if host_str == "messenger.com" || host_str.ends_with(".messenger.com") {
            return true;
        }

        // 2. Facebook authentication, recovery (Forgot Password), 2FA checkpoint & OAuth
        if host_str == "facebook.com" || host_str.ends_with(".facebook.com") {
            let path = url.path();
            if path.starts_with("/checkpoint")
                || path.starts_with("/login")
                || path.starts_with("/recover")
                || path.starts_with("/identify")
                || path.starts_with("/two_step_verification")
                || path.starts_with("/dialog")
                || path.starts_with("/v")
                || path.starts_with("/ajax")
            {
                return true;
            }
        }

        // 3. Workplace domain: *.workplace.com
        if host_str == "workplace.com" || host_str.ends_with(".workplace.com") {
            return true;
        }

        false
    }

    /// Kiểm tra scheme an toàn cho việc mở ra trình duyệt bên ngoài
    pub fn is_safe_scheme(scheme: &str) -> bool {
        scheme == "https" || scheme == "http"
    }

    /// Khử tham số theo dõi (fbclid, tracking redirect) từ URL liên kết ngoài
    pub fn strip_tracking_url(mut url: Url) -> Url {
        for _ in 0..3 {
            // Xử lý Facebook redirect wrapper: https://l.messenger.com/l.php?u=<target>
            let is_tracking_redirect = url
                .host_str()
                .map(|h| h.ends_with("messenger.com") || h.ends_with("facebook.com"))
                .unwrap_or(false)
                && url.path().ends_with("/l.php");

            if is_tracking_redirect {
                if let Some((_, target)) = url.query_pairs().find(|(k, _)| k == "u") {
                    if let Ok(nested_url) = Url::parse(&target) {
                        url = nested_url;
                        continue;
                    }
                }
            }
            break;
        }

        // Loại bỏ các query parameter tracking phổ biến
        let filtered_pairs: Vec<(String, String)> = url
            .query_pairs()
            .filter(|(k, _)| {
                let key = k.as_ref();
                !key.starts_with("fbclid")
                    && !key.starts_with("__xts__")
                    && !key.starts_with("__tn__")
                    && key != "h"
            })
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();

        url.set_query(None);
        if !filtered_pairs.is_empty() {
            for (k, v) in filtered_pairs {
                url.query_pairs_mut().append_pair(&k, &v);
            }
        }

        url
    }

    /// Khử khuẩn URL và mở an toàn bằng trình duyệt mặc định của hệ thống
    pub fn sanitize_and_open_external(url_str: &str) -> Result<(), PolicyError> {
        let parsed = Url::parse(url_str).map_err(|_| PolicyError::InvalidUrl)?;

        if !Self::is_safe_scheme(parsed.scheme()) {
            return Err(PolicyError::DangerousScheme);
        }

        let clean_url = Self::strip_tracking_url(parsed);

        open::that_detached(clean_url.as_str())
            .map_err(|e| PolicyError::OpenExternalFailed(e.to_string()))?;

        Ok(())
    }
}

