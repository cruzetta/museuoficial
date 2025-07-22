const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Inicializa o Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

/**
 * Substitui os placeholders de meta tags em uma string HTML.
 * @param {string} html O conteúdo do arquivo HTML.
 * @param {object} data Os dados para preencher as tags (title, image, description, url).
 * @return {string} O HTML com as tags substituídas.
 */
const replaceMetaTags = (html, data) => {
    const defaults = {
        title: "Museu Itinerante do Videojogo",
        description: "Explore a história e a evolução dos videogames em nosso acervo completo.",
        image: "https://museu-cca6d.web.app/imagens/LOGO%20MUSEU%20DO%20VIDEOGAME%20LETRAS%20BRANCAS%20(1).png",
        url: "https://museu-cca6d.web.app"
    };

    const title = data.title || defaults.title;
    const description = data.description || defaults.description;
    const image = data.image || defaults.image;
    const url = data.url || defaults.url;

    const cleanDescription = description.replace(/<[^>]+>/g, '').substring(0, 160);

    return html
        .replace(/__OG_TITLE__/g, title)
        .replace(/__OG_DESCRIPTION__/g, cleanDescription)
        .replace(/__OG_IMAGE__/g, image)
        .replace(/__OG_URL__/g, url);
};

// Aumentamos a memória para prevenir timeouts em cold starts.
exports.dynamicRenderer = functions.runWith({ memory: '1GB' }).https.onRequest(async (req, res) => {
    const requestPath = req.path;
    const itemId = req.query.id;
    const userAgent = req.headers['user-agent'] || '';
    const fullUrl = `https://museu-cca6d.web.app${req.originalUrl}`;
    const appId = 'museu-cca6d';

    // Lista mais completa de robôs
    const botUserAgents = ['facebookexternalhit', 'Twitterbot', 'WhatsApp', 'LinkedInBot', 'Pinterest', 'Discordbot', 'Googlebot'];
    const isBot = botUserAgents.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));

    // Configuração das páginas dinâmicas
    let config;
    if (requestPath.startsWith("/item_detalhe.html")) {
        config = {
            collectionName: "acervos",
            htmlFile: "item_detalhe.html",
            titleField: "nome",
            descriptionField: "detalhes",
            imageField: "imagem_principal"
        };
    } else if (requestPath.startsWith("/noticia.html")) {
        config = {
            collectionName: "noticias",
            htmlFile: "noticia.html",
            titleField: "titulo",
            descriptionField: "subtitulo",
            imageField: "imagem_principal"
        };
    }

    // Se não for uma página dinâmica, não faz nada.
    if (!config) {
        res.status(404).send("Página não configurada.");
        return;
    }

    const htmlFilePath = path.resolve(__dirname, `../public/${config.htmlFile}`);

    try {
        const html = fs.readFileSync(htmlFilePath, "utf8");

        // --- CAMINHO PARA UTILIZADORES NORMAIS ---
        // Se NÃO for um robô, envia o HTML original para que o JS do cliente funcione.
        if (!isBot) {
            res.set("Content-Type", "text/html");
            res.status(200).send(html);
            return;
        }

        // --- CAMINHO APENAS PARA ROBÔS ---
        console.log(`[LOG] Bot detectado: ${userAgent}. A renderizar: ${fullUrl}`);

        // Se o robô aceder sem um ID, serve as tags padrão.
        if (!itemId) {
            console.log("[LOG] Nenhum ID de item encontrado. A servir tags padrão.");
            const finalHtml = replaceMetaTags(html, { url: fullUrl });
            res.set("Content-Type", "text/html");
            res.status(200).send(finalHtml);
            return;
        }
        
        // Caminho completo para a coleção no Firestore
        const collectionPath = `artifacts/${appId}/public/data/${config.collectionName}`;
        console.log(`[LOG] A consultar Firestore. Caminho: ${collectionPath}, ID: ${itemId}`);
        
        const docRef = db.collection(collectionPath).doc(itemId);
        const docSnap = await docRef.get();
        
        let metaData = { url: fullUrl };

        if (docSnap.exists) {
            const itemData = docSnap.data();
            console.log(`[LOG] Documento encontrado: ${itemData[config.titleField]}`);
            metaData = {
                ...metaData,
                title: itemData[config.titleField],
                description: itemData[config.descriptionField],
                image: itemData[config.imageField]
            };
        } else {
            console.log(`[LOG] ALERTA: Documento com ID '${itemId}' não foi encontrado em '${collectionPath}'.`);
            metaData = {
                ...metaData,
                title: "Conteúdo não encontrado",
                description: "O conteúdo que você está procurando não foi encontrado em nosso site."
            };
        }

        const finalHtml = replaceMetaTags(html, metaData);
        console.log("[LOG] HTML final enviado para o bot.");
        res.set("Content-Type", "text/html");
        res.status(200).send(finalHtml);

    } catch (error) {
        console.error(`[ERRO CRÍTICO] Falha ao renderizar a página. Erro:`, error);
        res.status(500).send("Ocorreu um erro interno ao processar a sua solicitação.");
    }
});
