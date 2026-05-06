// Register endpoint (robust)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    // Server-side validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }
    if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "Please provide a valid email." });
    }
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    // Check existing user
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered. Try logging in." });
    }

    // Hash and save
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });

    // return safe message (do not return password)
    return res.status(201).json({ message: "User registered successfully", user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("Register error:", err);

    // handle duplicate key error from mongoose (just in case)
    if (err && err.code === 11000) {
      return res.status(409).json({ message: "Email already registered." });
    }

    // Generic fallback
    return res.status(500).json({ message: "Server error while creating user.", error: err.message || err });
  }
});
