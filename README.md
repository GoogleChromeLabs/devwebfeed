## Development

### Create credential files.

Create a `serviceAccountKey.json` file in the root folder and add your service
account credentials from the Google Developer Console.

Create a OAuth web app credentials file in the Google Developer Console and
add it to the root folder. It should be named `google_oauth_credentials.json.`.

Create `twitter_credentials.json` in the root folder and fill it with the API
key, consumer key/secret obtained from Twitter.

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

Adding `?edit` to the URL will allow you to remove posts submitted by humans (not bot posts like
RSS or Tweets). The first time you try to remove a post, you'll sign in through Google's OAuth flow.

## Deploy

To deploy:

```
yarn deploy
```

## Extension

Install the extension directory as an unpacked extension. The first time you
post an URL, an OAuth popup will open asking you to login. This is so we know
who added the post.
