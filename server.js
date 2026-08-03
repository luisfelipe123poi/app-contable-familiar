const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Servir archivos estáticos apuntando a "CONTABLE PAGINA"
app.use(express.static(path.join(__dirname, 'CONTABLE PAGINA')));

// Inicializar OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// --- MODELOS DE MONGOOSE ---

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

// --- ENDPOINTS / RUTAS ---

// 1. Obtener todos los datos financieros
app.get('/api/financials', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1 });
        const recurrings = await Recurring.find().sort({ day: 1 });
        res.json({ transactions, recurrings });
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener datos financieros: ' + err.message });
    }
});

// 2. Registrar Transacción
app.post('/api/transactions', async (req, res) => {
    try {
        const newDoc = new Transaction(req.body);
        await newDoc.save();
        res.status(201).json(newDoc);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 3. Eliminar Transacción
app.delete('/api/transactions/:id', async (req, res) => {
    try {
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Registrar Deuda Recurrente
app.post('/api/recurrings', async (req, res) => {
    try {
        const newDoc = new Recurring(req.body);
        await newDoc.save();
        res.status(201).json(newDoc);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 5. Toggle Pagado/No Pagado en Recurrente
app.patch('/api/recurrings/:id/toggle', async (req, res) => {
    try {
        const doc = await Recurring.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'No encontrado' });
        doc.paid = !doc.paid;
        await doc.save();
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Eliminar Deuda Recurrente
app.delete('/api/recurrings/:id', async (req, res) => {
    try {
        await Recurring.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Consulta a OpenAI Copilot
app.post('/api/ai-consult', async (req, res) => {
    try {
        const { caja_actual, ingresos_totales, gastos_totales, deudas_pendientes_por_pagar, historial_reciente } = req.body;

        const prompt = `
            Actúa como un copiloto financiero experto para una familia/negocio.
            Analiza el siguiente resumen de flujo de caja y da un consejo estratégico, directo y conciso (máximo 3 párrafos cortos):

            - Saldo Actual en Caja: $${caja_actual}
            - Ingresos Totales: $${ingresos_totales}
            - Gastos Totales: $${gastos_totales}
            - Compromisos Pendientes por Pagar: ${JSON.stringify(deudas_pendientes_por_pagar)}
            - Últimos movimientos: ${JSON.stringify(historial_reciente)}

            Indica riesgos inmediatos, margen real de maniobra y 2 recomendaciones concretas.
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 350
        });

        const advice = completion.choices[0].message.content;
        res.json({ advice });

    } catch (err) {
        console.error("Error OpenAI:", err);
        res.status(500).json({ error: err.message });
    }
});

// Fallback para servir el index.html desde "CONTABLE PAGINA"
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'CONTABLE PAGINA', 'index.html'));
});

// --- CONEXIÓN Y SERVIDOR ---

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ ERROR CRÍTICO: La variable MONGO_URI no está configurada.");
}

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Conectado exitosamente a MongoDB');
        app.listen(PORT, () => {
            console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ Error de conexión a MongoDB:', err.message);
    });
