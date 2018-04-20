## Development

### Create credential files

- Create a `serviceAccountKey.json` file in the root folder and add your service
account credentials from the Google Developer Console.

- Create a OAuth web app credentials file in the Google Developer Console and
add it to the root folder. It should be named `google_oauth_credentials.json.`.

- Create `twitter_credentials.json` in the root folder and fill it with the API
key, consumer key/secret obtained from Twitter.

- Create `analyticsServiceAccountKey.json` in the root folder and fill it with
service account credentials that are restricted to use the Google Analytics
Core Reporting API.

### Installation

Setup it up:

```
yarn
```

Build it:

```
yarn build
```

### Run it

Serve it:

```
yarn start
```

Navigate to http://localhost:8080/. The page will update in realtime as people
add posts.

Navigate to http://localhost:8080/ssr will server the server-side rendered version of the app
using headless Chrome.

Signing in (top of the page) allows admins to remove posts submitted by humans (not bot posts like
RSS or Tweets). The first time you try to remove a post, you'll sign in through Google's OAuth flow.

## Deploy

To deploy:

```
yarn deploy
```

## Extension

A companion [chrome extension](https://chrome.google.com/webstore/detail/dev-web-firehose/eimdpjkdpfcbochbgfaadbpgpoaplhja) is available to share posts on the feed you find interesting and which
are not automatically pulled in. Things like gists, release notes, samples,
external articles).

**Note:** The first time you share an URL, an OAuth popup will open asking you to login. This is so we know who added the post.

####

Apache 2.0 © 2018 Google Inc.
