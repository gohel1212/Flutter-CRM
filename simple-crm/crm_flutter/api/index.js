const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'crm_super_secret_key_12345';

// Middlewares
app.use(cors());
app.use(express.json());

// Helper function to map dates to snake_case for Flutter JSON compatibility
const mapDateFields = (obj) => {
  if (!obj) return obj;
  const mapped = { ...obj };
  if (obj.createdAt) {
    mapped.created_at = obj.createdAt.toISOString();
    delete mapped.createdAt;
  }
  if (obj.updatedAt) {
    mapped.updated_at = obj.updatedAt.toISOString();
    delete mapped.updatedAt;
  }
  return mapped;
};

// Middleware: Authenticate JWT Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied: Token missing' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.userId = verified.id;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Root Health Route
app.get('/api', (req, res) => {
  res.json({ message: 'CRM API is active and running' });
});

// POST /api/register - Register a new user
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create the user
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    return res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/login - Authenticate user & get JWT token
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Create JWT Token
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /api/dashboard - Get CRM summary statistics
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const totalContacts = await prisma.contact.count({
      where: { userId: req.userId },
    });

    const totalCustomers = await prisma.customer.count({
      where: { userId: req.userId },
    });

    const activeCustomers = await prisma.customer.count({
      where: {
        userId: req.userId,
        status: 'Active',
      },
    });

    const potentialCustomers = await prisma.customer.count({
      where: {
        userId: req.userId,
        status: 'Potential',
      },
    });

    return res.json({
      totalContacts,
      totalCustomers,
      activeCustomers,
      potentialCustomers,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return res.status(500).json({ error: 'Server error fetching dashboard metrics' });
  }
});

// === CONTACTS CRUD ===

// GET /api/contacts - Read all contacts
app.get('/api/contacts', authenticateToken, async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(contacts.map(mapDateFields));
  } catch (err) {
    console.error('Fetch contacts error:', err);
    return res.status(500).json({ error: 'Server error fetching contacts' });
  }
});

// POST /api/contacts - Create a new contact
app.post('/api/contacts', authenticateToken, async (req, res) => {
  const { name, email, phone, company, position, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        name,
        email: email || '',
        phone: phone || '',
        company: company || '',
        position: position || '',
        notes: notes || '',
        userId: req.userId,
      },
    });

    return res.status(201).json(mapDateFields(contact));
  } catch (err) {
    console.error('Create contact error:', err);
    return res.status(500).json({ error: 'Server error creating contact' });
  }
});

// PUT /api/contacts/:id - Update an existing contact
app.put('/api/contacts/:id', authenticateToken, async (req, res) => {
  const contactId = parseInt(req.params.id);
  const { name, email, phone, company, position, notes } = req.body;

  if (isNaN(contactId)) {
    return res.status(400).json({ error: 'Invalid contact ID' });
  }

  try {
    // Verify ownership
    const existing = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Contact not found or unauthorized' });
    }

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: {
        name: name !== undefined ? name : existing.name,
        email: email !== undefined ? email : existing.email,
        phone: phone !== undefined ? phone : existing.phone,
        company: company !== undefined ? company : existing.company,
        position: position !== undefined ? position : existing.position,
        notes: notes !== undefined ? notes : existing.notes,
      },
    });

    return res.json(mapDateFields(updated));
  } catch (err) {
    console.error('Update contact error:', err);
    return res.status(500).json({ error: 'Server error updating contact' });
  }
});

// DELETE /api/contacts/:id - Delete a contact
app.delete('/api/contacts/:id', authenticateToken, async (req, res) => {
  const contactId = parseInt(req.params.id);

  if (isNaN(contactId)) {
    return res.status(400).json({ error: 'Invalid contact ID' });
  }

  try {
    // Verify ownership
    const existing = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Contact not found or unauthorized' });
    }

    await prisma.contact.delete({
      where: { id: contactId },
    });

    return res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    console.error('Delete contact error:', err);
    return res.status(500).json({ error: 'Server error deleting contact' });
  }
});

// === CUSTOMERS CRUD ===

// GET /api/customers - Read all customers
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(customers.map(mapDateFields));
  } catch (err) {
    console.error('Fetch customers error:', err);
    return res.status(500).json({ error: 'Server error fetching customers' });
  }
});

// POST /api/customers - Create a customer
app.post('/api/customers', authenticateToken, async (req, res) => {
  const { name, email, phone, company, address, status } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const customer = await prisma.customer.create({
      data: {
        name,
        email: email || '',
        phone: phone || '',
        company: company || '',
        address: address || '',
        status: status || 'Potential',
        userId: req.userId,
      },
    });

    return res.status(201).json(mapDateFields(customer));
  } catch (err) {
    console.error('Create customer error:', err);
    return res.status(500).json({ error: 'Server error creating customer' });
  }
});

// PUT /api/customers/:id - Update a customer
app.put('/api/customers/:id', authenticateToken, async (req, res) => {
  const customerId = parseInt(req.params.id);
  const { name, email, phone, company, address, status } = req.body;

  if (isNaN(customerId)) {
    return res.status(400).json({ error: 'Invalid customer ID' });
  }

  try {
    // Verify ownership
    const existing = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Customer not found or unauthorized' });
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        name: name !== undefined ? name : existing.name,
        email: email !== undefined ? email : existing.email,
        phone: phone !== undefined ? phone : existing.phone,
        company: company !== undefined ? company : existing.company,
        address: address !== undefined ? address : existing.address,
        status: status !== undefined ? status : existing.status,
      },
    });

    return res.json(mapDateFields(updated));
  } catch (err) {
    console.error('Update customer error:', err);
    return res.status(500).json({ error: 'Server error updating customer' });
  }
});

// DELETE /api/customers/:id - Delete a customer
app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
  const customerId = parseInt(req.params.id);

  if (isNaN(customerId)) {
    return res.status(400).json({ error: 'Invalid customer ID' });
  }

  try {
    // Verify ownership
    const existing = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Customer not found or unauthorized' });
    }

    await prisma.customer.delete({
      where: { id: customerId },
    });

    return res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    console.error('Delete customer error:', err);
    return res.status(500).json({ error: 'Server error deleting customer' });
  }
});

// Local running support
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Development API server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
