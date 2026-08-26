/**
 * Central error handling for the Express API.
 *
 * Express 5 forwards both synchronous throws and rejected async handlers to
 * the error middleware, so routes stay clean and every failure shape lands
 * in one place with a consistent JSON response.
 */

/** Domain error with an explicit HTTP status (e.g. 404 Bot not found). */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Central error handler — must be registered LAST.
 * Never leaks internals: 5xx responses get a generic message while the real
 * error is logged server-side.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Malformed JSON body (thrown by express.json)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  // Body over the configured size limit
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  // Rejected by the CORS allowlist
  if (err.message?.startsWith('Not allowed by CORS')) {
    return res.status(403).json({ error: 'Origin not allowed by CORS policy' });
  }

  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) {
    console.error('[server error]', err);
    return res.status(status).json({ error: 'Internal server error' });
  }
  res.status(status).json({ error: err.message });
}
