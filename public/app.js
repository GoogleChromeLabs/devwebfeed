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
let auth;

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
  if (!confirm('Are you sure you want to delete this post?')) {
    return false;
  }

  auth.authenticated().then(token => {
    const date = new Date(dateStr);
    dateStr = date.toJSON();
    const [year, month, day] = dateStr.split('-');

    dbHelper.deletePost(year, month, url); // async
  });

  return false;
}

function filterBy(key, needle = null) {
  const filteringParams = ['domain', 'author'];

  if (key && !filteringParams.includes(key)) {
    return;
  }

  const currentURL = new URL(location.href);
  const params = currentURL.searchParams;
  const filterEl = document.querySelector('#filtering');
  const needleEl = filterEl.querySelector('.filtering-needle');

  filterEl.hidden = false;

  // Clear all previous filters.
  for (const key of params.keys()) {
    if (filteringParams.includes(key)) {
      params.delete(key);
    }
  }

  let filteredPosts = _posts;

  // TODO: support filtering on more than one thing.
  if (needle === _filteringBy) {
    params.delete(key);
    _filteringBy = null;
  } else {
    filteredPosts = filteredPosts.filter(post => post[key] === needle);
    params.set(key, needle);
    needleEl.textContent = needle;
    _filteringBy = needle;
  }

  setTimeout(() => filterEl.classList.toggle('on', _filteringBy !== null), 0);

  window.history.pushState(null, '', currentURL.href);
  renderPosts(filteredPosts, container);
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

    const month = changes[0].oldIndex; // Index in collection maps to the month.

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

function toggleHelp() {
  function handleOverlayClick(e) {
    const helpContent = document.querySelector('.help-content');
    if (!helpContent.contains(e.target)) {
      toggleHelp();
      help.removeEventListener('click', handleOverlayClick);
    }
  }

  function handleKeyDown(e) {
    if (e.keyCode === 27) {
      toggleHelp();
      document.body.removeEventListener('keyup', handleKeyDown);
    }
  }

  const help = document.querySelector('#help');
  help.classList.toggle('active');

  if (help.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
    help.addEventListener('click', handleOverlayClick);
    document.body.addEventListener('keyup', handleKeyDown);
  } else {
    document.body.style.overflow = '';
    help.removeEventListener('click', handleOverlayClick);
    document.body.removeEventListener('keyup', handleKeyDown);
  }
  return false;
}

async function getPosts(forYear, includeTweets = false) {
  // const lastYearsPosts = await fetchPosts(`/posts/${util.currentYear - 1}`);
  const thisYearsPosts = await fetchPosts(`/posts/${forYear}`);

  // const posts = util.uniquePosts([...thisYearsPosts, ...lastYearsPosts, ...tweets]);
  const posts = thisYearsPosts;
  if (includeTweets) {
    const tweets = await fetchPosts(`/tweets/ChromiumDev`);
    posts.push(...tweets);
  }

  // Ensure list of rendered posts is unique based on URL.
  return util.uniquePosts(posts);
}

async function initAuth() {
  const GSignIn = (await import('./auth.js')).default;
  auth = new GSignIn();

  const token = await auth.init();
  if (token) {
    const login = document.querySelector('#login');
    const email = login.querySelector('.login-email');
    email.addEventListener('click', async e => {
      e.preventDefault();

      if (!confirm('Logout?')) {
        return false;
      }

      await auth.signOut();
      login.hidden = true;
    });

    email.textContent = token.email;
    login.hidden = false;
  }
}

(async() => {
  const PRE_RENDERED = container.querySelector('#posts'); // Already exists in DOM if we've SSR.

  const params = new URL(location.href).searchParams;

  try {
    // Populates client-side cache for future realtime updates.
    // Note: this basically results in 2x requests per page load, as we're
    // making the same requests the server just made. Now repeating them client-side.
    _posts = await getPosts(params.get('year') || util.currentYear, params.has('tweets'));

     // Posts markup is already in place if we're SSRing. Don't re-render DOM.
    if (!PRE_RENDERED) {
      renderPosts(_posts, container);
    }

    realtimeUpdatePosts(util.currentYear);  // Subscribe to realtime firestore updates for current year.

    if (params.has('edit')) {
      container.classList.add('edit');
      await initAuth();
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
window.toggleHelp = toggleHelp;
