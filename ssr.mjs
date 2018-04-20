/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import url from 'url';
const URL = url.URL;
import puppeteer from 'puppeteer';

const RENDER_CACHE = new Map(); // Cache of pre-rendered HTML pages.

let browserWSEndpoint = null;

/**
 * Server-side renders a URL using headless chrome.
 *
 * Measurements:
 *   - onlyCriticalRequests: true reduces total render time by < 50ms
 *     (<2% slowdown) compared to no optimizations
 *   - inlineStyles: true appears to add negligible overhead.
 *   - TODO: see if these opts actually matter for FMP in the browser,
 *     especially on mobile.
 *
 * @param {string} url The url to prerender.
 * @param {!Object} config Optional config settings.
 *     useCache: Whether to consult the cache. Default is true.
 *     inlineStyles: Whether to inline local stylesheets. True by default.
 *     inlineScripts: Whether to inline local scripts. True by default.
 *     onlyCriticalRequests: Reduces the number of requests the
 *         browser makes by aborting requests that are non-critical to
 *         rendering the DOM of the page (stylesheets, images, media).
 *         True by default.
 *     reuseChrome: Set to false to relaunch a new instance of Chrome on
 *         every call. Default is false.
 *     headless: Set to false to launch headlful chrome. Default is true.
 *         Note: this param will have no effect if Chrome was launched at
 *         least once with reuseChrome: true.
 *     existingBrowser: existing browser instance to use. `reuseChrome` and
 *         `headless` are ignored if this is present.
 * @return {string} Serialized page output as an html string.
 */
async function ssr(url, {useCache = true, onlyCriticalRequests = true,
                   inlineStyles = true, inlineScripts = true,
                   reuseChrome = false, headless = true,
                   existingBrowser = null} = {}) {
  if (useCache && RENDER_CACHE.has(url)) {
    return RENDER_CACHE.get(url);
  }

  const tic = Date.now();
  // Reuse existing browser instance or launch a new one.
  let browser = existingBrowser;
  if (browser) {
    console.info('Connecting to provided chrome instance.');
    browser = await puppeteer.connect({
      browserWSEndpoint: await browser.wsEndpoint()
    });
  } else if (browserWSEndpoint && reuseChrome) {
    console.info('Reusing previously launched chrome instance.');
    browser = await puppeteer.connect({browserWSEndpoint});
  } else {
    browser = await puppeteer.launch({
      args: ['--disable-dev-shm-usage'],
      headless,
    });
    browserWSEndpoint = await browser.wsEndpoint();
  }

  const page = await browser.newPage();

  await page.setRequestInterception(true);

  const resourcesWhiteList = [
    'document', 'script', 'xhr', 'fetch', 'websocket'
  ];
  const urlBlackList = [
    '/gtag/js', // Don't load Google Analytics (e.g. inflates page metrics).
  ];

  page.on('request', req => {
    const url = req.url();

    // Prevent some resources from loading.
    if (urlBlackList.find(regex => url.match(regex))) {
      req.abort();
      return;
    }

    // Don't abort CSS requests if we're inlining stylesheets into page. Need
    // their responses.
    if (inlineStyles) {
      resourcesWhiteList.push('stylesheet');

      if (url.endsWith('styles.css'))  {
        return req.respond({
          status: 200,
          contentType: 'text/css',
          body: fs.readFileSync('./public/styles.min.css', 'utf-8'),
        });
      }
    }

    // Small optimization. We only care about rendered DOM, ignore images, and
    // other media that don't produce markup.
    const type = req.resourceType();
    if (onlyCriticalRequests && !resourcesWhiteList.includes(type)) {
      req.abort();
      return;
    }

    req.continue(); // pass through everything else.
  });

  const stylesheetContents = {};
  const scriptsContents = {};

  if (inlineStyles || inlineScripts) {
    page.on('response', async resp => {
      const href = resp.url();
      const type = resp.request().resourceType();
      const sameOriginResource = new URL(href).origin === new URL(url).origin;
      // Only inline local resources.
      if (sameOriginResource) {
        if (type === 'stylesheet') {
          stylesheetContents[href] = await resp.text();
        } else if (type === 'script') {
          scriptsContents[href] = await resp.text();
        }
      }
    });
  }

  // TODO: another optimization might be to take entire page out of rendering
  // path by adding html { display: none } before page loads. However, this may
  // cause any script that looks at layout to fail e.g. IntersectionObserver.

  // Add param so client-side page can know it's being rendered by headless
  // on the server.
  const urlToFetch = new URL(url);
  urlToFetch.searchParams.set('headless', '');

  try {
    await page.goto(urlToFetch.href, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('#posts'); // wait for posts to be in DOM.
  } catch (err) {
    browserWSEndpoint = null;
    console.error(err);
    await browser.close();
    throw new Error('page.goto/waitForSelector timed out.');
  }

  if (inlineStyles) {
    await page.$$eval('link[rel="stylesheet"]', (sheets, stylesheetContents) => {
      sheets.forEach(link => {
        const css = stylesheetContents[link.href];
        if (css) {
          const style = document.createElement('style');
          style.textContent = css;
          link.replaceWith(style);
        }
      });
    }, stylesheetContents);
  }

  if (inlineScripts) {
    await page.$$eval('script[src]', (scripts, scriptsContents) => {
      scripts.forEach(script => {
        const js = scriptsContents[script.src];
        if (js) {
          const s = document.createElement('script');
          // Note: not using s.text b/c here we don't need to eval the script.
          // That will be done client side when the browser renders the page.
          s.textContent = js;
          s.type = script.getAttribute('type');
          script.replaceWith(s);
        }
      });
    }, scriptsContents);
  }

  // Use browser to prerender page.
  const html = await page.content(); // Get serialized DOM output!
  if (browserWSEndpoint && reuseChrome || existingBrowser) {
    await page.close(); // Close pages we opened.
  } else if (!existingBrowser) {
    await browser.close(); // Close browser if we created it.
  }
  console.info(`Headless rendered ${url} in: ${Date.now() - tic}ms`);

  RENDER_CACHE.set(url, html); // Cache rendered page.

  return html;
}

function clearCache() {
  RENDER_CACHE.clear();
}

/**
 * Removes items from the render cache that start with `origin`
 * @param {string} origin
 */
function deleteCacheItemsFromOrigin(origin) {
  // TODO: be more selective. This nukes all cache entries for URLs that
  // match the page's origin.
  for (const url of RENDER_CACHE.keys()) {
    if (url.startsWith(origin)) {
      RENDER_CACHE.delete(url);
    }
  }
}

export {ssr, clearCache, deleteCacheItemsFromOrigin};
