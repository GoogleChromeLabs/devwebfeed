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
import * as dbHelper from './firebaseHelper.mjs';

dbHelper.setApp(firebase.initializeApp(shared.firebaseConfig));

const _posts = [];
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

function handleDelete(el, dateStr, url) {
  const date = new Date(dateStr);
  dateStr = date.toJSON();
  const [year, month, day] = dateStr.split('-');

  if (!confirm('Are you sure you want to delete this post?')) {
    return false;
  }

  dbHelper.deletePost(year, month, url); // async.

  return false;
}

function filterBy(key, needle = null) {
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
 * @param {string} year Year to monitor updates for.
 * @param {!Array<!Object>} otherPosts Additional posts to render.
 */
function realtimeUpdatePosts(year, otherPosts) {
  const originalTitle = document.title;
  let numChanges = 0;

  // Subscribe to real-time db updates for current year.
  // TODO: setup monitoring changes for previous years.
  // TODO: refresh UI if a previous year's post is deleted.
  dbHelper.monitorRealtimeUpdateToPosts(year, changes => {
    if (document.hidden) {
      document.title = `(${++numChanges}) ${originalTitle}`;
    }

    // changes.forEach(change => {
    //   renderPosts([...change.doc.data().items, ...otherPosts], container);
    // });
    // for (const change of changes) {
    //   const items = change.doc.data().items;
    // }
    const posts = changes[0].doc.data().items;

    // TODO: only render deltas. Currently rendering everything.
    renderPosts([...posts, ...otherPosts], container);
  });

  // Show additions as they come in the tab title.
  document.addEventListener('visibilitychange', e => {
    if (!document.hidden && numChanges) {
      document.title = originalTitle;
      numChanges = 0;
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

    _posts.push(...posts); // populate cache

    if (!ssr) {
      renderPosts(posts, container);
    }

    realtimeUpdatePosts(util.currentYear, [...lastYearsPosts, ...tweets]);

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
