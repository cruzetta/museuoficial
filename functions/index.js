const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Inicializa o Firebase Admin SDK para ter acesso ao Firestore.
admin.initializeApp();

/**
 * Substitui os placeholders de meta tags em uma string HTML.
 * @param {string} html O conteúdo do arquivo HTML.
 * @param {object} data Os dados para preencher as tags (title, image, description, url).
 * @return {string} O HTML com as tags substituídas.
 */
const replaceMetaTags = (html, data) => {
    // Garante que os valores não sejam nulos ou indefinidos para evitar erros.
    const title = data.title || "Museu Itinerante do Videojogo";
    const description = data.description || "Explore a história e a evolução dos videogames em nosso acervo completo.";
    const image = data.image || "https://museu-cca6d.web.app/imagens/LOGO%20MUSEU%20DO%20VIDEOGAME%20LETRAS%20BRANCAS%20(1).png";
    const url = data.url || "https://museu-cca6d.web.app";

    // Remove tags HTML da descrição e limita o tamanho.
    const cleanDescription = description.replace(/<[^>]+>/g, '').substring(0, 160);

    return html
        .replace(/__OG_TITLE__/g, title)
        .replace(/__OG_DESCRIPTION__/g, cleanDescription)
        .replace(/__OG_IMAGE__/g, image)
        .replace(/__OG_URL__/g, url);
};

exports.dynamicRenderer = functions.https.onRequest(async (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    // Lista de bots comuns de redes sociais.
    const botUserAgents = [
        'facebookexternalhit', 'Twitterbot', 'WhatsApp', 'LinkedInBot', 'Pinterest'
    ];

    // Verifica se o request vem de um bot conhecido.
    const isBot = botUserAgents.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));
    
    // Se não for um bot, simplesmente sirva o arquivo estático para que o JS do cliente funcione normalmente.
    // O Firebase Hosting fará isso automaticamente se a função não responder.
    // Para garantir, podemos redirecionar, mas a melhor abordagem é deixar o hosting servir.
    // Neste caso, vamos focar em servir o conteúdo para os bots.
    if (!isBot && !req.path.endsWith('.html')) {
         // Deixa o Firebase Hosting lidar com outros arquivos (CSS, JS, imagens, etc.)
        res.status(404).send("Not a bot request for a dynamic page.");
        return;
    }

    const requestPath = req.path;
    const itemId = req.query.id;

    let collectionName;
    let htmlFilePath;
    let titleField = 'nome'; // Campo padrão para o título
    let descriptionField = 'detalhes'; // Campo padrão para a descrição

    // Determina a coleção e o arquivo HTML com base no caminho da URL.
    if (requestPath.startsWith("/item_detalhe.html")) {
        collectionName = "acervos";
        htmlFilePath = path.resolve(__dirname, "../public/item_detalhe.html");
    } else if (requestPath.startsWith("/noticia.html")) {
        collectionName = "noticias";
        htmlFilePath = path.resolve(__dirname, "../public/noticia.html");
        titleField = 'titulo'; // Campo de título para notícias
        descriptionField = 'subtitulo'; // Campo de descrição para notícias
    } else {
        // Se o caminho não corresponder, envia um 404.
        res.status(404).send("Página não encontrada.");
        return;
    }

    try {
        // Lê o arquivo HTML base da pasta 'public'.
        let html = fs.readFileSync(htmlFilePath, "utf8");
        const fullUrl = `https://museu-cca6d.web.app${req.originalUrl}`;

        // Se não houver ID, serve o HTML com as meta tags padrão.
        if (!itemId) {
            const defaultData = { url: fullUrl };
            const finalHtml = replaceMetaTags(html, defaultData);
            res.set("Content-Type", "text/html");
            res.status(200).send(finalHtml);
            return;
        }

        // Busca o documento específico no Firestore.
        const docRef = admin.firestore().collection(collectionName).doc(itemId);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const itemData = docSnap.data();
            const metaData = {
                title: itemData[titleField],
                description: itemData[descriptionField],
                image: itemData.imagem_principal,
                url: fullUrl
            };
            // Substitui os placeholders pelos dados do Firestore.
            html = replaceMetaTags(html, metaData);
        } else {
            // Se o item não for encontrado, ainda serve a página com tags padrão.
            const defaultData = { title: "Item não encontrado", url: fullUrl };
            html = replaceMetaTags(html, defaultData);
        }

        res.set("Content-Type", "text/html");
        res.status(200).send(html);

    } catch (error) {
        console.error("Erro ao renderizar a página dinâmica:", error);
        res.status(500).send("Ocorreu um erro interno ao processar sua solicitação.");
    }
});
