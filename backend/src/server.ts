import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import sniperRoutes from './routes/sniper';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (no auth required)
app.use('/auth', authRoutes);

// Sniper API routes (with basic auth)
app.use('/sniper/v1', sniperRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
