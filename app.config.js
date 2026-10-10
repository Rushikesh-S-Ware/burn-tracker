// Extends app.json. WEB_BASE_URL lets the web build live under a sub-path
// (GitHub Pages serves the site at https://<user>.github.io/<repo>/).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments ?? {}),
    baseUrl: process.env.WEB_BASE_URL || '',
  },
});
