import Cookie from 'cookie';
import { getRewriteScript, getServiceWorkerScript } from './rwscript';
const defaultRewriteRules = ["html", "plain", "strings", "cors"]

export type Enviornment = {
	PASSWORD?: string;
};

export default {
	async fetch(request, env: Enviornment, ctx): Promise<Response> {
		// auth via X-Proxy-Password, Basic, or ?password=
		const hasPassword = !!env.PASSWORD;
		if (hasPassword && !(request.headers.get('X-Proxy-Password') === env.PASSWORD || request.headers.get('Authorization') === `Basic ${btoa(`:${env.PASSWORD}`)}` || new URL(request.url).searchParams.get('password') === env.PASSWORD)) {
			return new Response('Not Authorized');
		}
		const url = new URL(request.url);
		if (url.pathname === "/test") {
			const html = `<html><body><a href="/test123">test</a><img src="https://images.ctfassets.net/8aevphvgewt8/6wiE9miII032Gezk0o9Te1/ee11fc2f683d83dbbf09b2d69bd75f96/Image_Area__60_40__2.webp"></body></html>`;
			return new Response(html, {
				headers: {
					'Content-Type': 'text/html',
				},
			});
		} else if (url.pathname === "/test123") {
			const html = `<html><body><li><ol><a href="/test">test!!!</a></ol></li></body></html>`;
			return new Response(html, {
				headers: {
					'Content-Type': 'text/html',
				},
			});
		} else if (url.pathname === "/rewriter.js") {
			if (!url.searchParams.has('origin')) {
				return new Response('Missing origin parameter', { status: 400 });
			}
			const origin = url.searchParams.get('origin')!;
			const rules = buildRewriteRules(url);
			const rewriteSelectors = getRewriteSelectors(rules);
			const baseUrl = buildNewUrl("%url%", null, false, rules, url, env.PASSWORD);
			const str = getRewriteScript(rules, rewriteSelectors, baseUrl, origin);
			return new Response(str, {
				headers: {
					'Content-Type': 'application/javascript',
				},
			});
		} else if (url.pathname === "/service-worker.js") {
			if (!url.searchParams.has('origin')) {
				return new Response('Missing origin parameter', { status: 400 });
			}
			const origin = url.searchParams.get('origin')!;
			const rules = buildRewriteRules(url);
			const baseUrl = buildNewUrl("%url%", null, false, rules, url, env.PASSWORD);
			const str = getServiceWorkerScript(baseUrl, origin);
			return new Response(str, {
				headers: {
					'Content-Type': 'application/javascript',
				},
			});
		}
		const enforceHttps = false;
		// /?url=https://example.com
		const targetUrlStr = decodeURIComponent(url.searchParams.get('url') ?? "");
		if (!targetUrlStr) {
			return new Response('Missing url parameter', { status: 400 });
		}
		// check protocol
		const targetUrl = new URL(targetUrlStr);
		if (enforceHttps && targetUrl.protocol !== 'https:') {
			return new Response('Only https urls are allowed', { status: 400 });
		}
		// check if it is at least http
		if (!['http:', 'https:'].includes(targetUrl.protocol)) {
			return new Response('Only http(s) urls are allowed', { status: 400 });
		}
		const rewriteRules = buildRewriteRules(url);

		const headers = new Headers();
		headers.set('User-Agent', request.headers.get('User-Agent') ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
		headers.set('Accept', request.headers.get('Accept') ?? '*/*');
		headers.set('Accept-Language', request.headers.get('Accept-Language') ?? 'en-US,en;q=0.9');
		headers.set('Accept-Encoding', request.headers.get('Accept-Encoding') ?? 'gzip, deflate, br');
		headers.set('Host', targetUrl.host);
		headers.set('Origin', targetUrl.origin);
		headers.set('Referer', targetUrl.origin);

		// strip all proxy headers
		const proxyHeaders = ['X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Forwarded-Port', 'X-Forwarded-Server', 'cf-ray', 'CF-Connecting-IP', 'CF-Connecting-IPv6']
		for (const header of proxyHeaders) {
			headers.delete(header);
		}
		const newReq = new Request(targetUrl, {
			method: request.method,
			headers: headers,
			body: request.body,
		})
		const response = await fetch(newReq);

		const newHeaders = new Headers(response.headers);
		const locationHeader = newHeaders.get('Location');
		if (locationHeader) {
			// rewrite location header
			const newLocation = new URL(locationHeader, targetUrl);
			newHeaders.set('Location', newLocation.href);
		}
		newHeaders.set('origin', targetUrl.origin);
		newHeaders.set('referer', targetUrl.origin);

		if (rewriteRules.includes("cors")) {
			newHeaders.delete("Content-Security-Policy");
			newHeaders.delete("Content-Security-Policy-Report-Only");
			const aclAllow = "Access-Control-Allow-";
			["Origin", "Methods", "Headers"].forEach((header) => {
				const key = aclAllow + header;
				newHeaders.set(key, "*");
			});
		}

		// rewrite cookies
		// TODO: figure out if this works properly
		const cookieHeader = newHeaders.get('Set-Cookie');
		if (cookieHeader) {
			// use cookie module to parse and rewrite cookies
			const cookies = Cookie.parse(cookieHeader);
			const newCookies = Object.entries(cookies).map(([name, value]) => {
				return Cookie.serialize(name, value, {
					sameSite: 'none',
					secure: true,
					domain: targetUrl.host,
				});
			});
			const newCookieHeader = newCookies.join('; ');
			newHeaders.set('Set-Cookie', newCookieHeader);
		}

		let finalResponse = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
		});

		// if it is text/html, rewrite the content
		if (rewriteRules.includes("html") && response.headers.get('Content-Type')?.includes('text/html')) {
			console.log('rewriting html');
			let rewriter = new HTMLRewriter();
			const rewriteSelectors = getRewriteSelectors(rewriteRules);
			for (const selector of rewriteSelectors) {
				rewriter = rewriter.on(selector, {
					element: (element) => {
						const attrName = selector.split('[')[1]?.split(']')[0];
						const attr = element.getAttribute(attrName); // TODO: some attributes aren't rewritten (some link[href] for some reason??)
						if (attr) {
							const newUrl = buildNewUrl(attr, targetUrl, enforceHttps, rewriteRules, url, env.PASSWORD);
							element.setAttribute(attrName, newUrl);
						}
					}
				})
			}

			if (rewriteRules.includes("scripts")) {
				console.log("Registering script rewriter");
				rewriter = rewriter.on("script", {
					element: (element) => {
						const attr = element.getAttribute('src');
						if (attr) {
							// check if it already is rewritten
							if (attr.startsWith('data:') || attr.startsWith(url.origin)) {
								return;
							}
							const newUrl = buildNewUrl(attr, targetUrl, enforceHttps, rewriteRules, url, env.PASSWORD);
							element.setAttribute('src', newUrl);
						}
					}
				})
			}

			// rewrite js
			if (!url.searchParams.has("noinject")) {
				// add /rewriter.js script
				const scriptUrl = `${url.origin}/rewriter.js?rules=${rewriteRules.join(',')}&origin=${targetUrl.origin}`;
				const script = `<script src="${scriptUrl}"></script>`;
				rewriter = rewriter.on('head', {
					element: (element) => {
						element.append(script, { html: true });
					}
				})
				if (!url.searchParams.has("noinject-sw")) {
					// add service worker
					const swUrl = `${url.origin}/service-worker.js?origin=${targetUrl.origin}`;
					const swScript = `<script>
					navigator.serviceWorker.register('${swUrl}').then((registration) => {
						console.log('ServiceWorker registered', registration);
					}).catch((error) => {
						console.error('ServiceWorker failed to register', error);
					});
					</script>`;
					rewriter = rewriter.on('head', {
						element: (element) => {
							element.append(swScript, { html: true });
						}
					})
				}
			}

			finalResponse = rewriter.transform(finalResponse);
		}

		if (rewriteRules.includes("plain") && response.headers.get("Content-Type")?.includes("text/plain")) {
			const text = await response.text();
			const replacedText = text.replace(/(https?:\/\/[^ ]+)/g, (match) => {
				return buildNewUrl(match, targetUrl, enforceHttps, rewriteRules, url, env.PASSWORD);
			});
			finalResponse = new Response(replacedText, {
				status: response.status,
				statusText: response.statusText,
				headers: newHeaders,
			});
		}

		return finalResponse;
	},
} satisfies ExportedHandler<Env>;

const buildRewriteRules = (url: URL) => {
	let rewriteRules: string[] = (url.searchParams.has('rewrite') && url.searchParams.get('rewrite')?.split(',')) || defaultRewriteRules;
		if (url.searchParams.has("rw-exclude")) {
			const excludeRules = url.searchParams.get('rw-exclude')?.split(',');
			rewriteRules = rewriteRules.filter(rule => !excludeRules?.includes(rule));
		}
		if (url.searchParams.has('rewrite-js')) {
			rewriteRules.push('scripts');
		}
		return rewriteRules;
	}

const getRewriteSelectors = (rules: string[]) => {
	const rewriteSelectors = [
		"a[href]",
		"img[src]",
		"link[href]",
		"form[action]",
		...(rules.includes("scripts") ? ["script[src]"] : []), // rewriting scripts breaks some sites, so it's disabled by default
	]
	return rewriteSelectors;
}

const buildNewUrl = (target: string, targetUrl: URL | null, enforceHttps: boolean, rewriteRules: string[], url: URL, password: string | undefined) => {
	if (target.startsWith('data:')) {
		return target;
	}
	// check if target is a relative url
	if (target.startsWith('/') && targetUrl) {
		target = targetUrl.origin + target;
	}
	if (enforceHttps && target.startsWith('http://')) {
		target = target.replace('http://', 'https://');
	}
	const queryParams = new URLSearchParams();
	if (rewriteRules !== defaultRewriteRules) {
		queryParams.set('rewrite', rewriteRules.join(','));
	}
	if (password) {
		queryParams.set('password', password);
	}
	const queryStr = queryParams.toString();
	const final = `${url.origin}/?url=${encodeURIComponent(target)}${queryStr ? `&${queryStr}` : ''}`;
	if (target.includes("_next/static/chunks"))
		console.log('rewriting', target, 'to', final);
	return final;
}
