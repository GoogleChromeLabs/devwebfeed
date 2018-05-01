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

// https://developers.google.com/identity/protocols/OAuth2UserAgent

class GSignIn {
  constructor() {
    this.CLIENT_ID = '1067674167387-tbujmtjm5i6kf4ffqgck54pm7jnh05o9.apps.googleusercontent.com';
    this.token = null;
  }

  async authenticated() {
    if (this.token) {
      return Promise.resolve(this.token);
    }
    return this.signIn();
  }

  async init() {
    const params = new Map(location.hash.substr(1).split('&').map(param => param.split('=')));
    const accessToken = params.get('access_token');
    if (accessToken) {
      const state = params.get('state');
      const profileInfo = await this.getTokenInfo(accessToken);
      const token = Object.assign(profileInfo, {accessToken});
      localStorage.setItem('token', JSON.stringify(token));

      // Redirect to where the user started the auth journey.
      const url = new URL(state, location);
      url.hash = '';
      location.href = url.href;
      return;
    }

    this.token = JSON.parse(localStorage.getItem('token'));
    if (this.token) {
      // Refreshes the token if it has expired.
      const profileInfo = await this.getTokenInfo(this.token.accessToken);

      const expiresOn = new Date(this.token.exp * 1000);
      const now = new Date();
      console.info(`Token expires on ${expiresOn}`, now > expiresOn ? 'expired' : '');

      await this.loadAndInitFirebase(this.token.accessToken);
    }

    this.initLoggedInUI();

    return this.getUid();
  }

  async loadAndInitFirebase(accessToken) {
    if (!firebase.auth) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        script.src = '/firebase/firebase-auth.js';
        document.body.appendChild(script);
      });
    }

    const credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
    await firebase.auth().signInWithCredential(credential);

    // TODO: This re-POSTs to server on every page refresh if user is not admin.
    const admin = await this.isAdmin();
    if (!admin) {
      await this.updateUserIsAdmin();
    }
  }

  signIn() {
    const scopes = ['profile', 'email'];//, 'https://www.googleapis.com/auth/datastore'];

    // Create element to open OAuth 2.0 endpoint in new window.
    const form = document.createElement('form');
    form.setAttribute('method', 'GET');
    form.setAttribute('action', 'https://accounts.google.com/o/oauth2/v2/auth');

    const params = {
      'client_id': this.CLIENT_ID,
      'redirect_uri': `${location.origin}/oauth2callback`, // redirect to base url.
      'scope': scopes.join(' '),
      'include_granted_scopes': 'true',
      'response_type': 'token', // 'code'
      'state': location.href.replace(location.origin, ''),
    };

    // Add form parameters as hidden input values.
    for (let p in params) {
      var input = document.createElement('input');
      input.setAttribute('type', 'hidden');
      input.setAttribute('name', p);
      input.setAttribute('value', params[p]);
      form.appendChild(input);
    }

    // Add form to page and submit it to open the OAuth 2.0 endpoint.
    document.body.appendChild(form);
    form.submit();
    form.remove();
  }

  async getTokenInfo(accessToken = null) {
    accessToken = accessToken || this.token && this.token.accessToken;
    if (!accessToken) {
      return;
    }

    return fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`)
      .then(resp => {
        if (resp.status !== 200) {
          console.log('Refreshing token...');
          localStorage.removeItem('token');

          return this.signIn();
        }
        return resp.json();
      }).then(json => {
        if (json.aud !== this.CLIENT_ID) {
          throw new Error("aud property doesn't match provided client id");
        }
        return json;
      });
  }

  async signOut() {
    if (!this.token) {
      return;
    }

    try {
      const resp = await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${this.token.accessToken}`);
    } catch (err) {
      // fetch will throw a CORS error, but token will still be revoked.
    }

    if (firebase && firebase.auth) {
      await firebase.auth().signOut();
    }
    localStorage.removeItem('token');
    this.token = null;
  }

  getUid() {
    return firebase && firebase.auth ? firebase.auth().currentUser.uid : null;
  }

  getProfilePic(size = 72) {
    let url = firebase && firebase.auth ? firebase.auth().currentUser.photoURL : null;
    if (url) {
      const parts = url.split('/');
      parts.splice(parts.length - 1, 0, `s${size}-c`)
      url = parts.join('/');
    }
    return url;
  }

  getEmail() {
    if (!this.token) {
      return this.signIn();
    }
    return this.token.email;
  }

  async getProfile() {
    const resp = await fetch(`https://people.googleapis.com/v1/people/me?personFields=names,photos&access_token=${this.token.accessToken}`);
    if (!resp.ok) {
      this.signIn();
      return;
    }
    return resp.json();
  }

  async isAdmin(forceRefresh = false) {
    const token = await this.authenticated();
    const idToken = await firebase.auth().currentUser.getIdToken(forceRefresh);
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    return payload.admin;
  }

  async updateUserIsAdmin(uid = this.getUid()) {
    return await fetch(`/admin/user/update/${uid}`, {method: 'POST', body: ''});
  }

  async initLoggedInUI() {
    const login = document.querySelector('#login');
    const email = login.querySelector('.login-email');
    login.addEventListener('click', e => {
      if (login === e.target || login.contains(e.target)) {
        e.preventDefault();

        this.authenticated().then(async token => {
          if (token) {
            login.classList.add('authenticated');

            if (!confirm('Logout?')) {
              return false;
            }

            await this.signOut();
            login.classList.remove('authenticated');
          }
        });
      }
    });

    if (this.token) {
      const profilePic = this.getProfilePic();
      if (profilePic) {
        email.querySelector('img').src = profilePic;
      }
      const admin = await this.isAdmin(true);
      email.title = this.token.email + (admin ? ' (admin)' : '');
      login.classList.add('authenticated');
    }
  }
}

export {GSignIn};
