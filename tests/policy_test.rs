use caprine_rust::policy::{PolicyEngine, PolicyError};
use url::Url;

#[test]
fn test_internal_url_whitelist() {
    let valid_messenger = Url::parse("https://www.messenger.com/t/12345678").unwrap();
    assert!(PolicyEngine::is_internal_url(&valid_messenger));

    let valid_2fa = Url::parse("https://www.facebook.com/checkpoint/flow/?next=...").unwrap();
    assert!(PolicyEngine::is_internal_url(&valid_2fa));

    let valid_workplace = Url::parse("https://mycompany.workplace.com/chat").unwrap();
    assert!(PolicyEngine::is_internal_url(&valid_workplace));

    let invalid_http = Url::parse("http://www.messenger.com/").unwrap();
    assert!(!PolicyEngine::is_internal_url(&invalid_http));

    let invalid_spoof = Url::parse("https://notmessenger.com/").unwrap();
    assert!(!PolicyEngine::is_internal_url(&invalid_spoof));

    let invalid_subdomain_spoof = Url::parse("https://messenger.com.evil.com/").unwrap();
    assert!(!PolicyEngine::is_internal_url(&invalid_subdomain_spoof));
}

#[test]
fn test_strip_tracking_parameters() {
    let raw_url = Url::parse("https://example.com/article?fbclid=IwAR3x_abc123&__xts__=xyz&ref=home").unwrap();
    let cleaned = PolicyEngine::strip_tracking_url(raw_url);

    assert_eq!(cleaned.as_str(), "https://example.com/article?ref=home");
}

#[test]
fn test_nested_facebook_redirect_stripping() {
    let redirect_url = Url::parse("https://l.messenger.com/l.php?u=https%3A%2F%2Fgithub.com%2Fsindresorhus%2Fcaprine%3Ffbclid%3D12345&h=AT1...").unwrap();
    let cleaned = PolicyEngine::strip_tracking_url(redirect_url);

    assert_eq!(cleaned.as_str(), "https://github.com/sindresorhus/caprine");
}

#[test]
fn test_dangerous_schemes_denied() {
    assert_eq!(
        PolicyEngine::sanitize_and_open_external("javascript:alert(1)"),
        Err(PolicyError::DangerousScheme)
    );

    assert_eq!(
        PolicyEngine::sanitize_and_open_external("file:///C:/Windows/System32/cmd.exe"),
        Err(PolicyError::DangerousScheme)
    );

    assert_eq!(
        PolicyEngine::sanitize_and_open_external("data:text/html,<b>pwned</b>"),
        Err(PolicyError::DangerousScheme)
    );
}

