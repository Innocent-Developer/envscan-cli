function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  const dbUrl = process.env.DB_URL;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return `signed:${payload}:${secret}:${dbUrl}`;
}

module.exports = { signToken };
