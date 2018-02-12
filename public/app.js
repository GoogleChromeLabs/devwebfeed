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

let _posts = [];
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

  dbHelper.deletePost(year, month, url); // async

  return false;
}

function filterBy(key, needle = null) {
  const currentURL = new URL(location.href);
  const filterEl = document.querySelector('#filtering');
  const needleEl = filterEl.querySelector('.filtering-needle');
  let posts = _posts;

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
 */
function realtimeUpdatePosts(year) {
  const originalTitle = document.title;
  let numChanges = 0;

  // Subscribe to real-time db updates for current year.
  // TODO: setup monitoring changes for previous years. e.g. refresh UI if a
 //  previous year's post is deleted.
  dbHelper.monitorRealtimeUpdateToPosts(year, async changes => {
    if (document.hidden) {
      document.title = `(${++numChanges}) ${originalTitle}`;
    }

    const month = changes[0].oldIndex; // Index in doc's maps to the the month.

    _posts = _posts.filter(post => {
      const s = new Date(post.submitted);
      const inMonthAndYear = String(s.getFullYear()) === year && s.getMonth() === month;
      return !inMonthAndYear || (inMonthAndYear && post.submitter.bot);
    });

    // for (const change of changes) {
    //   const items = change.doc.data().items;
    // }
    const updatePosts = changes[0].doc.data().items;

    _posts = util.uniquePosts([...updatePosts, ..._posts]); // update cache.

    // TODO: only render deltas. Currently rendering the entire list.
    renderPosts(_posts, container);
  });

  // Show additions as they come in the tab title.
  document.addEventListener('visibilitychange', e => {
    if (!document.hidden && numChanges) {
      document.title = originalTitle;
      numChanges = 0;
    }
  });
}

async function getLatestPosts() {
  const lastYearsPosts = await fetchPosts(`/posts/${util.currentYear - 1}`);
  const thisYearsPosts = await fetchPosts(`/posts/${util.currentYear}`);
  const tweets = await fetchPosts(`/tweets/ChromiumDev`);

  // Ensure list of rendered posts is unique based on URL.
  // Note: it already comes back sorted so we never need to sort client-side.
  const posts = util.uniquePosts([...thisYearsPosts, ...lastYearsPosts, ...tweets]);

  return posts;
}

(async() => {
  const ssr = container.querySelector('#posts');

  try {
    _posts = await getLatestPosts(); // populate cache

    // Posts are already rendered in the DOM for the SSR case. Don't re-render.
    if (!ssr) {
      renderPosts(_posts, container);
    }

    // Subscribe to firestore updates.
    realtimeUpdatePosts(util.currentYear);

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
