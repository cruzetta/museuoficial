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
 * @param {object} data Os dados para preencher as tags (title, description, image, url).
 * @return {string} O HTML com as tags substituídas.
 */
const replaceMetaTags = (html, data) => {
    // Valores padrão caso algo falhe
    const defaults = {
        title: "Museu Itinerante do Videojogo",
        description: "Explore a história e a evolução dos videogames em nosso acervo completo.",
        image: "https://museu-cca6d.web.app/imagens/LOGO%20MUSEU%20DO%20VIDEOGAME%20LETRAS%20BRANCAS%20(1).png",
        url: "https://museu-cca6d.web.app",
    };

    const title = data.title || defaults.title;
    const description = data.description || defaults.description;
    const image = data.image || defaults.image;
    const url = data.url || defaults.url;

    // Limpa a descrição de qualquer tag HTML e limita o tamanho
    const cleanDescription = (description || "").replace(/<[^>]+>/g, "").substring(0, 160);

    return html
        .replace(/__OG_TITLE__/g, title)
        .replace(/__OG_DESCRIPTION__/g, cleanDescription)
        .replace(/__OG_IMAGE__/g, image)
        .replace(/__OG_URL__/g, url);
};

exports.dynamicRenderer = functions.runWith({ memory: "1GB" }).https.onRequest(async (req, res) => {
    const requestPath = req.path;
    const itemId = req.query.id;
    const userAgent = req.headers["user-agent"] || "";
    const fullUrl = `https://museu-cca6d.web.app${req.originalUrl}`;
    
    // CORREÇÃO: O ID do seu projeto já está disponível no ambiente do Firebase.
    // Não é necessário defini-lo manualmente.
    // const appId = 'museu-cca6d';

    const botUserAgents = ["facebookexternalhit", "Twitterbot", "WhatsApp", "LinkedInBot", "Pinterest", "Discordbot", "Googlebot"];
    const isBot = botUserAgents.some((bot) => userAgent.toLowerCase().includes(bot.toLowerCase()));

    // Se não for um robô, não fazemos nada e deixamos o Firebase Hosting servir o arquivo estático.
    // Isso economiza recursos da função.
    if (!isBot) {
        // O Firebase Hosting irá automaticamente servir o arquivo de /public
        // Nós apenas encaminhamos a requisição.
        res.status(200).send(fs.readFileSync(path.resolve(__dirname, `../public${requestPath}`), "utf8"));
        return;
    }
    
    console.log(`[LOG] Bot detectado: ${userAgent}. Renderizando URL: ${fullUrl}`);

    let config;
    if (requestPath.startsWith("/item_detalhe")) {
        config = {
            collectionName: "acervos",
            templateFile: "item_detalhe.html",
            titleField: "nome",
            descriptionField: "detalhes",
            imageField: "imagem_principal",
        };
    } else if (requestPath.startsWith("/noticia")) {
        config = {
            collectionName: "noticias",
            templateFile: "noticia.html",
            titleField: "titulo",
            descriptionField: "subtitulo",
            imageField: "imagem_principal",
        };
    }

    if (!config) {
        console.error(`[ERRO] Nenhuma configuração encontrada para o caminho: ${requestPath}`);
        res.status(404).send("Página não configurada para renderização dinâmica.");
        return;
    }

    const htmlFilePath = path.resolve(__dirname, `./templates/${config.templateFile}`);
    
    try {
        const htmlTemplate = fs.readFileSync(htmlFilePath, "utf8");
        
        if (!itemId) {
            console.log("[LOG] Nenhum ID de item encontrado. Servindo tags padrão.");
            const finalHtml = replaceMetaTags(htmlTemplate, { url: fullUrl });
            res.set("Content-Type", "text/html; charset=utf-8");
            res.status(200).send(finalHtml);
            return;
        }
        
        // CORREÇÃO CRÍTICA: O caminho para os seus dados no Firestore estava incorreto.
        // O caminho correto inclui "artifacts/{appId}/public/data/".
        const collectionPath = `artifacts/museu-cca6d/public/data/${config.collectionName}`;
        console.log(`[LOG] Consultando Firestore. Caminho: ${collectionPath}, ID: ${itemId}`);
        
        const docRef = db.collection(collectionPath).doc(itemId);
        const docSnap = await docRef.get();
        
        let metaData = { url: fullUrl };

        if (docSnap.exists) {
            const itemData = docSnap.data();
            console.log(`[LOG] Documento encontrado. Dados:`, JSON.stringify(itemData));

            metaData = {
                ...metaData,
                title: itemData[config.titleField] || "",
                description: itemData[config.descriptionField] || "",
                image: itemData[config.imageField] || "",
            };
        } else {
            console.warn(`[ALERTA] Documento com ID '${itemId}' não foi encontrado em '${collectionPath}'.`);
            metaData = { ...metaData, title: "Conteúdo Não Encontrado" };
        }

        console.log("[LOG] Substituindo meta tags com os dados:", JSON.stringify(metaData));
        const finalHtml = replaceMetaTags(htmlTemplate, metaData);
        
        res.set("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(finalHtml);

    } catch (error) {
        console.error(`[ERRO CRÍTICO] Falha ao processar a requisição para ${fullUrl}. Erro:`, error);
        res.status(500).send("Ocorreu um erro interno ao processar sua solicitação.");
    }
});
