const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === Connect to MongoDB Atlas ===
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB Atlas connected."))
.catch(err => console.error("MongoDB connection error:", err));

// === Schemas ===
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});

const OrderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true, default: () => `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}` },
  name: String,
  email: String,
  phone: String,
  address: String,
  coffee: String,
  quantity: Number,
  price: Number,
  instructions: String,
  date: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const Order = mongoose.model("Order", OrderSchema);

// === Email Setup ===
const transporter = nodemailer.createTransport({
  service: "gmail", // or 'smtp.office365.com' etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendOrderEmails(order) {
  const adminEmail = process.env.ADMIN_EMAIL;

  const htmlContent = `
    <h2>New Coffee Order</h2>
    <p><strong>Name:</strong> ${order.name}</p>
    <p><strong>Email:</strong> ${order.email}</p>
    <p><strong>Phone:</strong> ${order.phone}</p>
    <p><strong>Address:</strong> ${order.address}</p>
    <p><strong>Coffee:</strong> ${order.coffee}</p>
    <p><strong>Quantity:</strong> ${order.quantity}</p>
    <p><strong>Unit Price:</strong> $${order.price.toFixed(2)}</p>
    <p><strong>Total:</strong> $${(order.quantity * order.price).toFixed(2)}</p>
    <p><strong>Instructions:</strong> ${order.instructions || "None"}</p>
  `;

  const mailOptionsUser = {
    from: `"Bean Haven" <${process.env.EMAIL_USER}>`,
    to: order.email,
    subject: "☕ Your Bean Haven Order Confirmation",
    html: `<p>Thank you for your order, ${order.name}!</p>${htmlContent}`,
  };

  const mailOptionsAdmin = {
    from: `"Bean Haven Orders" <${process.env.EMAIL_USER}>`,
    to: adminEmail,
    subject: "📥 New Coffee Order Received",
    html: htmlContent,
  };

  await transporter.sendMail(mailOptionsUser);
  await transporter.sendMail(mailOptionsAdmin);
}

// === Register User ===
app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  try {
    const user = await User.create({ name, email, password: hash });
    res.json({ success: true, message: "User registered", user: { name, email } });
  } catch (err) {
    res.status(400).json({ success: false, message: "Email already exists" });
  }
});

// === Login User ===
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (user && await bcrypt.compare(password, user.password)) {
    res.json({ success: true, user: { name: user.name, email: user.email } });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

// === Submit Order ===
app.post("/api/order", async (req, res) => {
  const { name, email, phone, address, coffee, quantity, price } = req.body;

  if (!name || !email || !phone || !address || !coffee || !quantity || !price) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const order = await Order.create(req.body);
    await sendOrderEmails(order);
    res.json({ success: true, order });
  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).json({ success: false, message: "Failed to save order or send emails" });
  }
});

// === Get Orders (Admin) ===
app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
});



app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail", // or another SMTP
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });

  const adminMailOptions = {
    from: `"${name}" <${email}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `New Contact Message from ${name}`,
    text: `From: ${name} (${email})\n\nMessage:\n${message}`
  };

  const userMailOptions = {
    from: `"Bean Haven" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "We received your message!",
    text: `Hi ${name},\n\nThanks for reaching out to Bean Haven! Here's a copy of your message:\n\n"${message}"\n\nWe'll get back to you shortly!\n\n— Bean Haven ☕`
  };

  try {
    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(userMailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error("Mail error:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});

// === Start Server ===
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
