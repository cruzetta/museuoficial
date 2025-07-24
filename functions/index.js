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

exports.dynamicRenderer = functions.runWith({ memory: '1GB' }).https.onRequest(async (req, res) => {
    const requestPath = req.path;
    const itemId = req.query.id;
    const userAgent = req.headers['user-agent'] || '';
    const fullUrl = `https://museu-cca6d.web.app${req.originalUrl}`;
    const appId = 'museu-cca6d';

    const botUserAgents = ['facebookexternalhit', 'Twitterbot', 'WhatsApp', 'LinkedInBot', 'Pinterest', 'Discordbot', 'Googlebot'];
    const isBot = botUserAgents.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));

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

    if (!config) {
        res.status(404).send("Página não configurada.");
        return;
    }

    const htmlFilePath = path.resolve(__dirname, `./templates/${config.htmlFile}`);
    console.log(`[LOG] A tentar ler o arquivo de template em: ${htmlFilePath}`);

    try {
        const htmlTemplate = fs.readFileSync(htmlFilePath, "utf8");
        console.log(`[LOG] Template HTML lido com sucesso. Comprimento: ${htmlTemplate.length} caracteres.`);

        if (!htmlTemplate.includes('__OG_TITLE__')) {
            console.error("[ERRO] O placeholder '__OG_TITLE__' NÃO foi encontrado no template lido!");
        } else {
            console.log("[LOG] Placeholder '__OG_TITLE__' encontrado no template.");
        }

        if (!isBot) {
            res.set("Content-Type", "text/html; charset=utf-8");
            res.status(200).send(htmlTemplate);
            return;
        }

        console.log(`[LOG] Bot detectado: ${userAgent}. A renderizar: ${fullUrl}`);

        if (!itemId) {
            console.log("[LOG] Nenhum ID de item encontrado. A servir tags padrão.");
            const finalHtml = replaceMetaTags(htmlTemplate, { url: fullUrl });
            res.set("Content-Type", "text/html; charset=utf-8");
            res.status(200).send(finalHtml);
            return;
        }
        
        const collectionPath = `artifacts/${appId}/public/data/${config.collectionName}`;
        console.log(`[LOG] A consultar Firestore. Caminho: ${collectionPath}, ID: ${itemId}`);
        
        const docRef = db.collection(collectionPath).doc(itemId);
        const docSnap = await docRef.get();
        
        let metaData = { url: fullUrl };

        if (docSnap.exists) {
            const itemData = docSnap.data();
            console.log(`[LOG] Documento encontrado. Dados brutos:`, JSON.stringify(itemData));

            const title = itemData[config.titleField] || '';
            const description = itemData[config.descriptionField] || '';
            const image = itemData[config.imageField] || '';
            console.log(`[LOG] Dados extraídos para as meta tags: Title='${title}', Image='${image}'`);

            metaData = { ...metaData, title, description, image };
        } else {
            console.log(`[LOG] ALERTA: Documento com ID '${itemId}' não foi encontrado em '${collectionPath}'.`);
            metaData = { ...metaData, title: "Conteúdo não encontrado" };
        }

        console.log("[LOG] A substituir as meta tags com os seguintes dados:", JSON.stringify(metaData));
        const finalHtml = replaceMetaTags(htmlTemplate, metaData);
        
        if (finalHtml.includes('__OG_TITLE__')) {
             console.error("[ERRO FINAL] Após a substituição, o placeholder '__OG_TITLE__' AINDA está presente no HTML final!");
        } else {
             console.log("[LOG] Substituição de placeholders parece ter sido bem-sucedida.");
        }

        res.set("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(finalHtml);

    } catch (error) {
        console.error(`[ERRO CRÍTICO] Falha ao ler o template ou ao executar a função. Caminho: ${htmlFilePath}`, error);
        res.status(500).send("Ocorreu um erro interno ao processar a sua solicitação.");
    }
});
