// Runs inside each test worker BEFORE test files import modules, so the
// Prisma client singleton picks up the test database.
process.env.DATABASE_URL = 'file:../data/test_integration.db';
process.env.JWT_SECRET = 'test-secret';
process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@factory.local';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'admin123';
