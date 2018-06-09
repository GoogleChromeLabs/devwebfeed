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
import {BLOG_TO_AUTHOR} from './shared.mjs';

const CACHE_POSTS = false;
const POSTS_CACHE = new Map(); // If CACHE_POSTS is true, RSS/Firebase posts are cached.

let db = null;
let monitoringChanges = false;

function setApp(firebaseApp) {
  db = firebaseApp.firestore();
  db.settings && db.settings({timestampsInSnapshots: true});
  return firebaseApp;
}

/**
 * @return {!Promise} Resolves when the post has been added to the db.
 */
async function newPost(post) {
  const url = post.url;
  const submitted = new Date(post.submitted);
  const year = String(submitted.getFullYear());
  const month = String(submitted.getMonth() + 1).padStart(2, '0');
  const day = String(submitted.getDate()).padStart(2, '0');

  const doc = db.collection(year).doc(month);
  if (!(await doc.get()).exists) {
    await doc.create({items: []});
  }

  const items = (await doc.get()).data().items;

  // If post is from gist, lookup author name.
  const githubAuthor = BLOG_TO_AUTHOR.find((item, i) => {
    return item.github && url.match(item.github)
  });
  if (githubAuthor) {
    post.author = githubAuthor.author;
  }

  // Don't add a dupe.
  if (items.find(item => item.url === url)) {
    return;
  }

  items.push(post);

  return doc.update({items});
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
    return doc.update({items});
  }
  console.warn(`No post for ${url} in ${year}/${month}`);
}

async function getPosts(year, month, day, otherPosts = [], maxResults = null) {
  let items = [];

  const cacheKey = `${year}-${month}-${day}`;
  if (POSTS_CACHE.has(cacheKey)) {
    items = POSTS_CACHE.get(cacheKey);
  } else {
    const postsCollection = db.collection(year);

    items = otherPosts; // First set RSS items.

    // Filter out RSS items not in the year.
    items = items.filter(item => {
      const submitted = new Date(item.submitted);
      return submitted.getFullYear() === parseInt(year);
    });

    if (month) {
      // Filter out RSS items not in the month.
      items = items.filter(item => {
        const submitted = new Date(item.submitted);
        return (submitted.getMonth() + 1) === parseInt(month);
      });

      const doc = await postsCollection.doc(month).get();
      if (doc.exists) {
        items.push(...doc.data().items);
      }
    } else {
      const querySnapshot = await postsCollection.get();
      for (const doc of querySnapshot.docs) {
        items.push(...(await doc.ref.get()).data().items);
      }
    }

    // Filter out items not in the day.
    if (day) {
      items = items.filter(item => {
        const submitted = new Date(item.submitted);
        return submitted.getDate() === parseInt(day);
      });
    }

    // TODO: construct a db query that returns sorted results.
    util.sortPostsByDate(items);

    // if (doc.exists) {
    //   console.log(doc.data())
    //   items = doc.data().items;
    // } else {
    //   console.warn(`No posts exist for ${doc.id}.`);
    // }

    if (CACHE_POSTS) {
      POSTS_CACHE.set(cacheKey, items);
    }
  }

  // TODO: use limit() on Firebase query.
  if (maxResults) {
    items = items.slice(0, maxResults);
  }

  return items;
}

/**
 * Monitors incremental firestore for changes (those after the first snapshot
 * of all data is returned).
 * @param {string} year Year to monitor.
 * @param {!Function} callback
 */
function monitorRealtimeUpdateToPosts(year, callback) {
  // Don't add more than one monitor.
  if (monitoringChanges) {
    return;
  }

  db.collection(year).onSnapshot(snapshot => {
    // Firestore sends all data in first callback. Monitor changes after the
    // initial snapshop.
    if (!monitoringChanges) {
      monitoringChanges = true;
      return;
    }

    callback(snapshot.docChanges());
  });
}

export {setApp, newPost, deletePost, getPosts, monitorRealtimeUpdateToPosts};
