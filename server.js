import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// Esquemas de la Base de Datos
const TransactionSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'income' | 'expense'
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: String, required: true },
  description: { type: String, required: true }
});

const RecurringSchema = new mongoose.Schema({
  day: { type: Number, required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  paid: { type: Boolean, default: false }
});

const Transaction = mongoose.model('Transaction', TransactionSchema);
const Recurring = mongoose.model('Recurring', RecurringSchema);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- RUTAS API ---

// 1. Obtener todos los datos globales
app.get('/api/financials', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    const recurrings = await Recurring.find().sort({ day: 1 });
    res.json({ transactions, recurrings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Crear transacción
app.post('/api/transactions', async (req, res) => {
  try {
    const newTx = new Transaction(req.body);
    await newTx.save();
    res.status(201).json(newTx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Borrar transacción
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Crear deuda recurrente
app.post('/api/recurrings', async (req, res) => {
  try {
    const newRec = new Recurring(req.body);
    await newRec.save();
    res.status(201).json(newRec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Alternar estado pagado de deuda recurrente
app.patch('/api/recurrings/:id/toggle', async (req, res) => {
  try {
    const item = await Recurring.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    item.paid = !item.paid;
    await item.save();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Borrar deuda recurrente
app.delete('/api/recurrings/:id', async (req, res) => {
  try {
    await Recurring.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Consulta a OpenAI
app.post('/api/ai-consult', async (req, res) => {
  try {
    const { caja_actual, ingresos_totales, gastos_totales, deudas_pendientes_por_pagar } = req.body;

    const prompt = `Actúa como un asesor financiero experto. Analiza el siguiente estado de caja:
    - Caja Actual Líquida: $${caja_actual}
    - Ingresos Totales: $${ingresos_totales}
    - Gastos Totales: $${gastos_totales}
    - Deudas Pendientes del Mes: ${JSON.stringify(deudas_pendientes_por_pagar)}

    Dame un diagnóstico directo y 3 recomendaciones clave en menos de 150 palabras para evitar quedar sin liquidez.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    res.json({ advice: response.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`));
