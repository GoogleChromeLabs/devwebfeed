const ORIGIN = 'https://devwebfeed.appspot.com'; //'http://localhost:8080';

let user = null;

function authUser() {
  return new Promise(resolve => {
    // Note: getAuthToken caches token, so it's safe to call repeatedly.
    chrome.identity.getAuthToken({interactive: true}, async token => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        return resolve();
      }

      // Return cached user.
      if (user) {
        return resolve(user);
      }

      const resp = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?alt=json&access_token=${token}`);
      resolve(await resp.json());
    });
  });
}

chrome.browserAction.onClicked.addListener(tab => {
  authUser().then(userInfo => {
    chrome.identity.getProfileUserInfo(info => {
      user = Object.assign(userInfo, info);
      sendPageInfo(user, tab);
    });
  });
});

// chrome.identity.removeCachedAuthToken({token}, () => {

// });

// function getCurrentTabUrl(callback) {
//   chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
//     // chrome.tabs.query invokes the callback with a list of tabs that match the
//     // query. When the popup is opened, there is certainly a window and at least
//     // one tab, so we can safely assume that |tabs| is a non-empty array.
//     // A window can only have one active tab at a time, so the array consists of
//     // exactly one tab.
//     const tab = tabs[0];

//     const url = tab.url;

//     console.assert(typeof url === 'string', 'tab.url should be a string');

//     callback(url);
//   });
// }

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
        return name.textContent.split(/\s/).filter(item => item).join(' ');
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
  const data = {
    title: await getPageTitle(tab),
    url: await getCanonicalLink(tab),
    submitted: (new Date()).toJSON(),
    submitter: {
      name: submitter.name,
      email: submitter.email,
      picture: submitter.picture,
      bot: false,
    },
    author: await getAuthor(tab),
  };

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
  } catch (err) {
    throw err;
  }

  console.log(data);
}

// // This extension loads the saved background color for the current tab if one
// // exists. The user can select a new background color from the dropdown for the
// // current page, and it will be saved as part of the extension's isolated
// // storage. The chrome.storage API is used for this purpose. This is different
// // from the window.localStorage API, which is synchronous and stores data bound
// // to a document's origin. Also, using chrome.storage.sync instead of
// // chrome.storage.local allows the extension data to be synced across multiple
// // user devices.
// document.addEventListener('DOMContentLoaded', () => {
//   getCurrentTabUrl((url) => {
//     changeBackgroundColor('#ffcc00');
//   });
// });
