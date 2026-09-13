function chargeCard(amount) {
  const stripeKey = process.env.STRIPE_KEY;
  const dbUrl = process.env.DB_URL;

  if (!stripeKey) {
    throw new Error('STRIPE_KEY is not configured');
  }

  return { amount, stripeKey, dbUrl };
}

module.exports = { chargeCard };
