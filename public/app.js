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

import * as util from './util.mjs';
import * as shared from './shared.mjs';
import {renderPosts, container} from './render.mjs';

firebase.initializeApp(shared.firebaseConfig);
const db = firebase.firestore();

const _postsCache = [];
let _filteringBy = null;

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

/**
 * @return {!Promise} Resolves when the post has been deleted from the db.
 */
async function deletePost(year, month, url) {
  const doc = db.collection(year).doc(month);
  const items = (await doc.get()).data().items;
  const idx = items.findIndex(item => item.url === url);
  if (idx !== -1) {
    items.splice(idx, 1);
    return docRef.update({items});
  }
  console.warn(`No post for ${url} in ${year}/${month}`);
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

/**
 * @param {!Array<!Object>} otherPosts Additional posts to render.
 */
function realtimeUpdatePosts(otherPosts) {
  const originalTitle = document.title;
  let numChanges = 0;
  let firstLoad = true;

  // Subscribe to real-time db updates for current year.
  // TODO: setup monitoring changes for previous years.
  // TODO: refresh UI if a previous year's post is deleted.
  db.collection(util.currentYear).onSnapshot(querySnapshot => {
    if (document.hidden) {
      document.title = `(${++numChanges}) ${originalTitle}`;
    }

    if (!firstLoad) {
      // querySnapshot.docChanges.forEach(change => {
      //   renderPosts([...change.doc.data().items, ...otherPosts], container);
      // });
      const thisYearsPosts = querySnapshot.docChanges[0].doc.data().items;
      renderPosts([...thisYearsPosts, ...otherPosts], container);
    }

    // TODO: only render new posts. Currently render everything.
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
  const ssr = container.querySelector('#posts');

  try {
    const lastYearsPosts = await fetchPosts(`/posts/${util.currentYear - 1}`);
    const thisYearsPosts = await fetchPosts(`/posts/${util.currentYear}`);
    const tweets = await fetchPosts(`/tweets/ChromiumDev`);
    const items = [...thisYearsPosts, ...lastYearsPosts, ...tweets];

    // Ensure list of rendered posts is unique based on URL.
    const posts = util.uniqueItemsByUrl(items);

    _postsCache.push(...posts); // populate

    if (!ssr) {
      renderPosts(posts, container);
    }

    realtimeUpdatePosts([...lastYearsPosts, ...tweets]);

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
