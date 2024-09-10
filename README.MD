# Cloudflare Worker Proxy

(IN DEVELOPMENT)

This is a cloudflare worker that can be used to proxy a site, that also rewrites urls/CORS headers.
Please note that client side javascript routing may not work properly (for example, traversing github files).

## Usage

The proxy can be accessed at `https://your-proxy.cloudflareworkers.com/?url=https://example.com`

### Rewrite Rules

The available rewrite rules are:
- html: rewrites html
- plain: rewrites plain text (Content-Type: text/plain)
- cors: rewrites CORS headers
- scripts: rewrites script tags [EXPERIMENTAL]

The default rewrite rules are:
html, plain, cors

To specify a custom list of rewrite rules, use the `rewrite` query parameter:
For example, to rewrite html and plain text, use `rewrite=html,plain`

To enable script rewriting, either use `rewrite-js` or `rewrite=...,scripts`

A rewrite rule can also be disabled with the `rw-exclude` query parameter:
For example, to disable html rewriting, but enable all the other defaults, use `rw-exclude=html`

### Injected JS
By default, if html rewriting is enabled, the proxy will inject a script that rewrites any links missed by the CloudFlare HTMLRewriter. (it does not rewrite all links for some reason)

This behavior can be disabled with the `noinject` query parameter.

A service worker is also injected, which intercepts all requests and rewrites them.
It can be disabled with the `noinject-sw` query parameter.

### Password

To protect the proxy, you can use the `password` query parameter:
For example, to protect the proxy with the password `secret`, use `password=secret`.

The password can be set in the `PASSWORD` secret.

