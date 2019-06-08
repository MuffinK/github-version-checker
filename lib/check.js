// Require modules
const https = require('https');
const github_graphql = require('github-graphql-client');
const semver = require('semver');
const query = require('./query');

/**
 * Executes a GraphQL query on the API to fetch either the latest release or tag.
 * The returned version is compared to the given version.
 * When the fetched version is greater than the given one, the newer version
 * is returned.
 *
 * @param options {object} The options for the version check.
 * @param callback {function|undefined} The callback function.
 */
const graphql = (options, callback) => {
  // build the query
  const theQuery = options.fetchTags ? query.tags(options.repo, options.owner) : query.releases(options.repo, options.owner);

  // do the api call
  github_graphql({
    token: options.token,
    query: theQuery
  }, (err, res) => {
    if (err) {
      callback(err, null);
    } else {
      // Retrieve newer version name
      const newer = options.fetchTags ? res.data.repository.refs.nodes[0] : res.data.repository.releases.nodes[0];
      // Compare versions
      if (semver.gt((options.fetchTags ? newer.name : newer.tag.name), options.currentVersion)) {
        callback(null, newer);
      } else {
        callback(null, null);
      }
    }
  });
};

/**
 * Executes an API call on the Github Rest API (v3) that should return the latest version.
 * The returned version is compared to the given version.
 * When the fetched version is greater than the given one, the newer version
 * is returned.
 *
 * @param options {object} The options for the version check.
 * @param callback {function|undefined} The callback function.
*/
const rest = (options, callback) => {
  const apiUrl = `https://api.github.com/repos/${options.owner}/${options.repo}/releases`;
  const opts = {
    hostname: 'gvc-reduce-json.axelrindle.de',
    path: '/?url=' + apiUrl,
    method: 'GET'
  };
  const req = https.request(opts, res => {
    const chunks = [];
    res.on('data', chunk => {
      return chunks.push(chunk.toString());
    });
    res.on('end', function() {
      // Make sure there are no errors and try to parse the response
      if (res.statusCode !== 200) {
        return callback(new Error(res.statusMessage), null);
      }
      const response = chunks.join('');
      let json = null;
      try {
        json = JSON.parse(response);
      } catch (error) {
        return callback(error, null);
      }
      if (json.message) {
        return callback(new Error(json.message), null);
      }
      // Compare versions
      let found = false;
      for (i = 0, len = json.length; i < len; i++) {
        let version = json[i];
        if (semver.gt(version.tag_name, options.currentVersion)) {
          found = true;
          break;
        }
      }
      if (found) {
        callback(null, version);
      } else {
        callback(null, null);
      }
    });
  });
  req.on('error', function(err) {
    callback(err, null);
  });
  req.end();
};

/**
 * Checks whether a new version is available. Depending on whether a token is given, the
 * Github GraphQL API (v4) will be used. Otherwise we rely on the Github Rest API (v3), which
 * does not require authentication.
 *
 * @param options {object} The options for the version check.
 * @param callback {function|undefined} The callback function.
 */
module.exports = (options, callback) => {
  // get options
  options.token = options.token || process.env.GITHUB_API_TOKEN || undefined;
  
  // check if required options are defined
  if (!options.repo) {
    callback('no repository specified', null);
    return;
  }
  if (!options.owner) {
    callback('no owner specified', null);
    return;
  }
  if (!options.currentVersion) {
    callback('no current version given', null);
    return;
  }

  // decide what to do
  // when we have a token supplied, we will call the GraphQL api
  if (options.token) {
    graphql(options, callback);
  } else {
    rest(options, callback);
  }
};