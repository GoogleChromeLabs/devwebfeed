const ORIGIN = 'https://devwebfeed.appspot.com';

function authUser() {
  return new Promise((resolve, reject) => {
    // Note: getAuthToken caches token, so it's safe to call repeatedly.
    chrome.identity.getAuthToken({interactive: true}, async token => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        return reject(token);
      }

      // TODO: consider caching profile response.
      const resp = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?alt=json&access_token=${token}`);
      const json = await resp.json();
      if (json.error) {
        console.error(json.error.message);
        return reject(token);
      }

      resolve(json);
    });
  });
}

chrome.browserAction.onClicked.addListener(async tab => {
  try {
    const userInfo = await authUser();
    chrome.identity.getProfileUserInfo(async profileInfo => {
      const user = Object.assign(userInfo, profileInfo);
      const json = await sendPageInfo(user, tab);

      chrome.browserAction.setBadgeText({text: 'OK'});
      setTimeout(() => chrome.browserAction.setBadgeText({text: ''}), 3000);
    });
  } catch (err) {
    // Revoke token. User needs to click button again.
    chrome.identity.removeCachedAuthToken({token}, () => {
      console.info('Cached token revoked');
    });
  }
});

function getCanonicalLink(tab) {
  return new Promise(resolve => {
    const code = `
      const canonical = document.querySelector('link[rel=canonical]');
      canonical && canonical.href;
    `;
    chrome.tabs.executeScript(tab.id, {code}, results => resolve(results[0] || tab.url));
  });
}

function getPageTitle(tab) {
  return new Promise(resolve => {
    chrome.tabs.executeScript(tab.id, {
      code: 'document.title || null;'
    }, result => {
      let title = result[0];
      // Cleanup Twitter titles.
      const m = title.match(/^.*on Twitter: "(.*)"/i);
      if (m) {
        title = m[1];
      }
      resolve(title);
    });
  });
}

function getAuthor(tab) {
  const code = `
    function getAuthor() {
      const metaAuthor = document.querySelector('meta[property=author], meta[name=author]');
      if (metaAuthor) {
        return metaAuthor.content;
      }

      const relAuthorLink = document.querySelector('link[rel=author]');
      if (relAuthorLink) {
        return relAuthorLink.href;
      }

      const itemPropAuthor = document.querySelector('[itemprop="author"]');
      const name = itemPropAuthor ? itemPropAuthor.querySelector('[itemprop="name"]') || itemPropAuthor : null;
      if (name) {
        return name.textContent.split(/\\s/).filter(item => item).join(' ');
      }
    }
    getAuthor();
  `;
  return new Promise(resolve => {
    chrome.tabs.executeScript(tab.id, {code}, result => {
      resolve(result[0] || null)
    });
  });
}

async function sendPageInfo(submitter, tab) {
  const url = await getCanonicalLink(tab);

  const data = {
    title: await getPageTitle(tab),
    url,
    domain: new URL(url).host,
    submitted: (new Date()).toJSON(),
    submitter: {
      name: submitter.name,
      email: submitter.email,
      picture: submitter.picture,
      bot: false,
    },
    author: await getAuthor(tab),
  };

  console.log(data);

  try {
    const resp = await fetch(`${ORIGIN}/posts`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {'Content-Type': 'application/json'}
    });
    const json = await resp.text();
    if (!resp.ok || json.error) {
      throw Error(json.error);
    }
    return json;
  } catch (err) {
    throw err;
  }
}
