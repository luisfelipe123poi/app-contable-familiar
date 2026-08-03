const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de CORS para aceptar peticiones desde Cloudflare y Localhost
const allowedOrigins = [
    'https://contable-familiar.prestigecloser.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(null, true); // Permite acceso universal en desarrollo/producción
        }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Servir la carpeta estática "contable pagina"
app.use(express.static(path.join(__dirname, 'contable pagina')));

// 1. Conexión a MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/control_financiero';

mongoose.connect(MONGO_URI)
    .then(() => console.log('⚡ Conectado exitosamente a MongoDB.'))
    .catch(err => console.error('❌ Error al conectar a MongoDB:', err.message));

// 2. Esquemas y Modelos
const transactionSchema = new mongoose.Schema({
    type: { type: String, enum: ['income', 'expense'], required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    date: { type: String, required: true },
    description: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const recurringSchema = new mongoose.Schema({
    day: { type: Number, required: true, min: 1, max: 31 },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    paid: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
const Recurring = mongoose.model('Recurring', recurringSchema);

// --- RUTAS DE LA API ---

app.get('/api/financials', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1, _id: -1 });
        const recurrings = await Recurring.find().sort({ day: 1 });
        res.json({ transactions, recurrings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { type, amount, category, date, description } = req.body;
        if (!type || !amount || !category || !date || !description) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }
        const newTransaction = new Transaction({ type, amount, category, date, description });
        const savedTransaction = await newTransaction.save();
        res.status(201).json(savedTransaction);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    try {
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ success: true, deletedId: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/recurrings', async (req, res) => {
    try {
        const { day, amount, description } = req.body;
        if (!day || !amount || !description) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }
        const newRecurring = new Recurring({ day, amount, description, paid: false });
        const savedRecurring = await newRecurring.save();
        res.status(201).json(savedRecurring);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/recurrings/:id/toggle', async (req, res) => {
    try {
        const recurring = await Recurring.findById(req.params.id);
        if (!recurring) return res.status(404).json({ error: 'Deuda no encontrada' });

        recurring.paid = !recurring.paid;
        await recurring.save();

        if (recurring.paid) {
            const today = new Date().toISOString().slice(0, 10);
            await Transaction.create({
                type: 'expense',
                amount: recurring.amount,
                category: 'Deudas',
                date: today,
                description: `[Pago Recurrente] ${recurring.description}`
            });
        }

        res.json(recurring);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/recurrings/:id', async (req, res) => {
    try {
        await Recurring.findByIdAndDelete(req.params.id);
        res.json({ success: true, deletedId: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ai-consult', async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en .env o en el panel de Render' });
    }

    const { caja_actual, ingresos_totales, gastos_totales, deudas_pendientes_por_pagar, historial_reciente } = req.body;

    const prompt = `Actúa como un Asesor Financiero Personal Senior de alto nivel.
Analiza el siguiente estado financiero y dame una estrategia concisa para evitar quedar en cero:

- Caja Actual Líquida: $${caja_actual}
- Ingresos Totales Mes: $${ingresos_totales}
- Gastos Totales Mes: $${gastos_totales}
- Deudas Fijas Pendientes: ${JSON.stringify(deudas_pendientes_por_pagar)}
- Últimos Movimientos: ${JSON.stringify(historial_reciente)}`;

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: 'Eres un consultor financiero personal directo y analítico.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.5
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            res.json({ advice: data.choices[0].message.content });
        } else {
            res.status(500).json({ error: data.error ? data.error.message : 'Error OpenAI' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ruta principal para servir el Frontend desde "contable pagina"
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'contable pagina', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
