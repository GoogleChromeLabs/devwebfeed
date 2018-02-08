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

import {html, render} from './lit-html.js';
import {repeat} from './lib/repeat.js';
import * as util from './util.mjs';
import * as shared from './shared.mjs';

firebase.initializeApp(shared.firebaseConfig);

const container = document.querySelector('#container')
const currentYear = String((new Date()).getFullYear());
const db = firebase.firestore();

const _postsCache = [];
let _filteringBy = null;

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(
        'en-US', {year: 'numeric', month: 'short', day: 'numeric'}).format(date);
  } catch (err) {
    console.error(dateStr, err);
  }
}

function groupBySubmittedDate(items) {
  const map = new Map();

  items.forEach(item => {
    const submitted = formatDate(item.submitted);
    if (!map.has(submitted)) {
      map.set(submitted, []);
    }
    map.get(submitted).push(item);
  });

  return Array.from(map.entries());
}

async function fetchPosts(url, maxResults = null) {
  try {
    url = new URL(url, document.baseURI);
    if (maxResults) {
      url.searchParams.set('maxresults', maxResults);
    }
    const resp = await fetch(url.toString());
    const json = await resp.json();
    if (!resp.ok || json.error) {
      throw Error(json.error);
    }
    return json;
  } catch (err) {
    throw err;
  }
}

function renderPostIcon(submitter) {
  if (!submitter || !submitter.picture) {
    return '';
  }
  const submitterStr = submitter.email ? `Submitted by ${submitter.email}` : '';
  return html`<img src="${submitter.picture}" class="profile_pic" title="${submitterStr}">`;
}

function iconSrc(domain) {
  let src = '';
  if (domain.match('github.com')) {
    src = 'img/github_icon.svg';
  } else if (domain.match('developers.google.com')) {
    src = 'img/wf_icon.png';
  } else if (domain.match('twitter.com')) {
    src = 'img/twitter_icon.png';
  } else if (domain.match('chromium.org')) {
    src = 'img/chromium_logo.svg';
  }
  return src;
}

function renderPosts(items, container) {
  util.sortPosts(items);

  // Group posts by the date they were submitted.
  items = groupBySubmittedDate(items);
  const template = (items) => html`
    <ul id="posts">
      ${repeat(items, (item) => item[1].url, (item, i) => {
        const date = item[0];
        const posts = item[1];

        const postTmplResults = repeat(posts, (post) => item.url, (post, i) => {
          post.domain = new URL(post.url).host;

          if (post.author) {
            post.author = post.author.trim();
          }
          const by = post.author ? `by ${post.author}` : '';

          return html`
            <li class="post layout start">
              <div class="overflow flex layout vertical" title="${post.title}">
                <div class="layout overflow">
                  <a class="post_child post_title" href="${post.url}" target="_blank">${post.title}</a>
                  <span class="post_child post_author clickable"
                        onclick="filterBy('author', '${post.author}')">${by}</span>
                </div>
                <span class="post_child post_domain clickable""
                      onclick="filterBy('domain', '${post.domain}')">
                      <img src="${iconSrc(post.domain)}" class="source_icon">${post.domain}
                </span>
              </div>
              <div class="layout">
                <a href="" class="remove_button" onclick="return handleDelete(this, '${date}', '${post.url}')"
                   title="Remove this post" data-rss="${post.rss}"></a>
                ${renderPostIcon(post.submitter)}
              </div>
            </li>`;
        });

        return html`
          <li class="posts_group">
            <h3 class="post_date">${formatDate(date)}</h3>
            <ol>${postTmplResults}</ol>
          </li>
        `;
      })}
    </ul>
  `;

  render(template(items), container);
}

/**
 * @return {!Promise} Resolves when the post has been deleted from the db.
 */
function deletePost(year, month, url) {
  const docRef = db.collection(year).doc(month);
  return docRef.get().then(snapshot => {
    const items = snapshot.data().items;
    const idx = items.findIndex(item => item.url === url);
    if (idx !== -1) {
      items.splice(idx, 1);
      return docRef.update({items});
    }
    console.warn(`No post for ${url} in ${year}/${month}`);
  });
}

function handleDelete(el, dateStr, url) {
  const date = new Date(dateStr);
  dateStr = date.toJSON();
  const [year, month, day] = dateStr.split('-');

  if (!confirm('Are you sure you want to delete this post?')) {
    return false;
  }

  deletePost(year, month, url); // async.

  return false;
}

function filterBy(key, needle = null) {
  let posts = _postsCache;
  const currentURL = new URL(location.href);
  const filterEl = document.querySelector('#filtering');
  const needleEl = filterEl.querySelector('.filtering-needle');

  // TODO: this clears all params...even those unrelated to filtering.
  for (const key of currentURL.searchParams.keys()) {
    currentURL.searchParams.delete(key);
  }

  // TODO: support filtering on more than one thing.
  if (needle === _filteringBy) {
    currentURL.searchParams.delete(key);
    filterEl.classList.remove('on');
    _filteringBy = null;
  } else {
    posts = posts.filter(post => post[key] === needle);
    currentURL.searchParams.set(key, needle);
    needleEl.textContent = needle;
    filterEl.classList.add('on');
    _filteringBy = needle;
  }

  window.history.pushState(null, '', currentURL.href);

  renderPosts(posts, container);
}

function clearFilters() {
  _filteringBy = null
  filterBy(null, null);
  return false;
}

function realtimeUpdatePosts(lastYearsPosts) {
  const originalTitle = document.title;
  let numChanges = 0;
  let firstLoad = true;

  // Subscribe to realtime db updates for current year.
  // TODO: also monitor changes to previous years. The UI currently won't
  // refresh if a previous year's post is deleted..
  db.collection(currentYear).onSnapshot(querySnapshot => {
    if (document.hidden) {
      document.title = `(${++numChanges}) ${originalTitle}`;
    }

    if (!firstLoad) {
      // querySnapshot.docChanges.forEach(change => {
      //   renderPosts([...change.doc.data().items, ...lastYearsPosts], container);
      // });
      const thisYearsPosts = querySnapshot.docChanges[0].doc.data().items;
      renderPosts([...thisYearsPosts, ...lastYearsPosts], container);
    }

    // TODO: only render new posts.
    // util.debounceRenderPosts(posts, container);
    firstLoad = false;
  });

  // Show additions as they come in the tab title.
  document.addEventListener('visibilitychange', e => {
    if (!document.hidden && numChanges) {
      document.title = originalTitle;
      numChanges = 0;
      // TODO: don't refresh entire page. Just refresh section.
      location.reload();
    }
  });
}

(async() => {
  try {
    const lastYearsPosts = await fetchPosts(`/posts/${currentYear - 1}`);
    const thisYearsPosts = await fetchPosts(`/posts/${currentYear}`);
    const items = [...thisYearsPosts, ...lastYearsPosts];

    // Ensure list of rendered posts is unique based on URL.
    const posts = Array.from(items.reduce((map, item) => {
      return map.set(item.url, item);
    }, new Map()).values());

    _postsCache.push(...posts); // populate

    renderPosts(posts, container);
    realtimeUpdatePosts(lastYearsPosts);

    const params = new URL(location.href).searchParams;
    if (params.has('edit')) {
      container.classList.add('edit');
    } else {
      for (const key of params.keys()) {
        filterBy(key, params.get(key));
      }
    }
  } catch (err) {
    console.error(err);
  }
})();

window.handleDelete = handleDelete;
window.filterBy = filterBy;
window.clearFilters = clearFilters;
