import * as util from '../../util.mjs';
import {firebaseConfig} from '../../shared.mjs';

firebase.initializeApp(firebaseConfig);

let auth;

async function initAuth() {
  const {GSignIn} = await import('../../auth.js');
  auth = new GSignIn();

  const uid = await auth.init();
  const token = await auth.authenticated();

  return uid;
}

async function fetchPosts(url, maxResults = null) {
  try {
    url = new URL(url, location);
    if (maxResults) {
      url.searchParams.set('maxresults', maxResults);
    }
    const resp = await fetch(url.href);
    const json = await resp.json();
    if (!resp.ok || json.error) {
      throw Error(json.error);
    }
    return json;
  } catch (err) {
    throw err;
  }
}

async function getPosts(forYear, uid = null) {
  const url = new URL(`/posts/${forYear}`, location);
  if (uid) {
    url.searchParams.set('uid', uid);
  }
  const posts = await fetchPosts(url.href);

  // Ensure list of rendered posts is unique based on URL.
  return util.uniquePosts(posts);
}

export {getPosts, initAuth};