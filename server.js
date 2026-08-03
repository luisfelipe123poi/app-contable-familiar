require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();

// ==========================================
// 1. CONFIGURACIÓN DE CORS Y MIDDLEWARES (Soluciona Opción 2/405)
// ==========================================

// Permitir peticiones desde cualquier origen y soportar preflight (OPTIONS)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Responder explícitamente a las solicitudes preflight OPTIONS
app.options('*', cors());

app.use(express.json());

// ==========================================
// 2. CONEXIÓN A MONGODB & OPENAI
// ==========================================
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/contable_familiar";
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado exitosamente a MongoDB'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ==========================================
// 3. MODELOS DE DATOS (Mongoose)
// ==========================================
const TransactionSchema = new mongoose.Schema({
    type: { type: String, enum: ['income', 'expense'], required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    date: { type: String, required: true },
    description: { type: String, required: true }
}, { timestamps: true });

const RecurringSchema = new mongoose.Schema({
    day: { type: Number, required: true, min: 1, max: 31 },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    paid: { type: Boolean, default: false }
}, { timestamps: true });

const Transaction = mongoose.model('Transaction', TransactionSchema);
const Recurring = mongoose.model('Recurring', RecurringSchema);

// ==========================================
// 4. RUTAS DE LA API (CRUD)
// ==========================================

// GET: Obtener todos los movimientos y recurrencias
app.get('/api/financials', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1 });
        const recurrings = await Recurring.find().sort({ day: 1 });
        res.json({ transactions, recurrings });
    } catch (err) {
        res.status(500).json({ error: 'Error obteniendo datos financieros', details: err.message });
    }
});

// POST: Registrar nueva transacción
app.post('/api/transactions', async (req, res) => {
    try {
        const { type, amount, category, date, description } = req.body;
        const newTransaction = new Transaction({ type, amount, category, date, description });
        await newTransaction.save();
        res.status(201).json(newTransaction);
    } catch (err) {
        res.status(400).json({ error: 'Error guardando transacción', details: err.message });
    }
});

// DELETE: Eliminar transacción por ID
app.delete('/api/transactions/:id', async (req, res) => {
    try {
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ message: 'Transacción eliminada correctamente' });
    } catch (err) {
        res.status(400).json({ error: 'Error eliminando transacción', details: err.message });
    }
});

// POST: Registrar nueva obligación fija / recurrente
app.post('/api/recurrings', async (req, res) => {
    try {
        const { day, amount, description } = req.body;
        const newRecurring = new Recurring({ day, amount, description });
        await newRecurring.save();
        res.status(201).json(newRecurring);
    } catch (err) {
        res.status(400).json({ error: 'Error guardando recurrencia', details: err.message });
    }
});

// PATCH: Alternar estado de pago de recurrente
app.patch('/api/recurrings/:id/toggle', async (req, res) => {
    try {
        const item = await Recurring.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Obligación no encontrada' });

        item.paid = !item.paid;
        await item.save();
        res.json(item);
    } catch (err) {
        res.status(400).json({ error: 'Error actualizando estado', details: err.message });
    }
});

// DELETE: Eliminar obligación recurrente
app.delete('/api/recurrings/:id', async (req, res) => {
    try {
        await Recurring.findByIdAndDelete(req.params.id);
        res.json({ message: 'Obligación recurrente eliminada' });
    } catch (err) {
        res.status(400).json({ error: 'Error eliminando recurrencia', details: err.message });
    }
});

// ==========================================
// 5. RUTA POST DE CONSULTA CON OPENAI (Soluciona Opción 3)
// ==========================================
app.post('/api/ai-consult', async (req, res) => {
    try {
        const { caja_actual, ingresos_totales, gastos_totales, deudas_pendientes_por_pagar, historial_reciente } = req.body;

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'La variable de entorno OPENAI_API_KEY no está configurada.' });
        }

        const promptSystem = `
            Eres un Asesor Financiero Personal experto. 
            Tu objetivo es evitar que el usuario se quede sin liquidez en el mes.
            Revisa el estado de caja actual, las deudas pendientes de pago y sus hábitos de gasto.
            Proporciona recomendaciones breves, directas, estratégicas y con viñetas.
        `;

        const promptUser = `
            Estado Financiero Actual del Usuario:
            - Saldo en Caja Disponible: $${caja_actual}
            - Ingresos Totales del Mes: $${ingresos_totales}
            - Gastos Registrados: $${gastos_totales}
            - Deudas Pendientes por Pagar este mes: ${JSON.stringify(deudas_pendientes_por_pagar)}
            - Últimos movimientos: ${JSON.stringify(historial_reciente)}

            Por favor, analiza estos datos y dame una estrategia de gestión de flujo de caja para este mes.
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: promptSystem },
                { role: "user", content: promptUser }
            ],
            temperature: 0.7,
            max_tokens: 600
        });

        const advice = completion.choices[0].message.content;
        res.json({ advice });

    } catch (err) {
        console.error("Error al consultar OpenAI:", err);
        res.status(500).json({ error: 'Error procesando la consulta con la IA', details: err.message });
    }
});

// Ruta base de prueba
app.get('/', (req, res) => {
    res.send('Servidor Contable Activo y Funcionando 🚀');
});

// Escuchar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});
