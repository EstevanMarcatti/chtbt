const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const { format } = require('date-fns');
const { v4: uuidv4 } = require('uuid');

const client = new Client({
    authStrategy: new LocalAuth()
});

// Armazenar dados temporários para cada usuário
const userSessions = {};

// Gerar PDF com as informações da denúncia
const generatePdf = async (data, phoneNumber) => {
    const reportNumber = uuidv4(); // Gera um código único para a denúncia
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    const { width, height } = page.getSize();

    const fontSize = 12;
    const margin = 50;
    const lineHeight = 20; // Ajusta a altura da linha

    const text = `
-------------------------------------------------------
            RELATÓRIO DE DENÚNCIA
-------------------------------------------------------

Número da Denúncia: ${reportNumber}

Prezado Vereador Dr. Danilo Marcatti,

Número de Eleição: 11340

Recebemos uma denúncia conforme abaixo:

Problema: ${data.problemType}
Bairro: ${data.neighborhood}
Local: ${data.location}
Detalhes: ${data.details}
Detalhes Adicionais: ${data.additionalDetails || 'N/A'}

Número de Contato do Denunciante: ${phoneNumber}

Sua denúncia foi enviada ao vereador Dr. Danilo Marcatti para análise.

Agradecemos por contribuir para a melhoria da nossa cidade.

Atenciosamente,

Equipe de Ouvidoria
-------------------------------------------------------
    `;

    page.drawText(text, {
        x: margin,
        y: height - margin - fontSize,
        size: fontSize,
        color: rgb(0, 0, 0),
        lineHeight: lineHeight
    });

    const pdfBytes = await doc.save();
    const fileName = `Denuncia_${reportNumber}.pdf`;

    fs.writeFileSync(fileName, pdfBytes);

    return fileName; // Retorna o nome do arquivo para enviar pelo WhatsApp
};

// Inicia a conversa com o usuário
const startConversation = async (message) => {
    userSessions[message.from] = {
        step: 'name',
        data: {}
    };
    client.sendMessage(message.from, `Olá! Bem-vindo ao Disk-Dan. 👋\nA ouvidoria do Dr. Danilo Marcatti - 11340\nQual é seu Nome?`);
};

// Manipula a entrada do nome do usuário
const handleName = async (message) => {
    userSessions[message.from].data.name = message.body;
    userSessions[message.from].step = 'neighborhood';
    client.sendMessage(message.from, `Olá ${userSessions[message.from].data.name} 👋\nEssa é a Ouvidoria da cidade de Itapira. Aqui você pode me informar os problemas que você enfrenta em seu bairro!\nPara começar, me informe o seu Bairro:`);
};

// Manipula a entrada do bairro do usuário
const handleNeighborhood = async (message) => {
    userSessions[message.from].data.neighborhood = message.body;
    userSessions[message.from].step = 'problemType';
    client.sendMessage(message.from, `Agora selecione o tipo de problema que você gostaria de denunciar.\nVocê pode escolher entre as opções:\n\n1 Lixo e limpeza\n2 Segurança pública\n3 Infraestrutura\n4 Saúde\n5 Educação\n6 Outros (Esporte, Cultura, Lazer, etc...)`);
};

// Manipula a seleção do tipo de problema pelo usuário
const handleProblemType = async (message) => {
    const problemTypes = [
        'Lixo e limpeza', 
        'Segurança pública', 
        'Infraestrutura', 
        'Saúde', 
        'Educação', 
        'Outros (Esporte, Cultura, Lazer, etc...)'
    ];
    const problemTypeIndex = parseInt(message.body, 10) - 1;
    
    if (problemTypeIndex >= 0 && problemTypeIndex < problemTypes.length) {
        userSessions[message.from].data.problemType = problemTypes[problemTypeIndex];
        userSessions[message.from].step = 'location';
        client.sendMessage(message.from, `Para entender melhor a situação, por favor, me informe o Local exato onde ocorre o problema:`);
    } else {
        client.sendMessage(message.from, `Escolha inválida. Por favor, selecione um número de 1 a 6.`);
    }
};

// Manipula a entrada do local do problema
const handleLocation = async (message) => {
    userSessions[message.from].data.location = message.body;
    userSessions[message.from].step = 'details';
    client.sendMessage(message.from, `Por favor descreva detalhadamente o problema que você está enfrentando para que possamos resolver:`);
};

// Manipula a entrada dos detalhes do problema
const handleDetails = async (message) => {
    userSessions[message.from].data.details = message.body;
    userSessions[message.from].step = 'additionalDetails'; // Adiciona etapa para detalhes adicionais
    client.sendMessage(message.from, `Se houver, por favor, adicione quaisquer Detalhes Adicionais que possam ser úteis:`);
};

// Manipula a entrada dos detalhes adicionais, se houver
const handleAdditionalDetails = async (message) => {
    userSessions[message.from].data.additionalDetails = message.body;
    userSessions[message.from].step = 'confirmation';
    const data = userSessions[message.from].data;
    const confirmationMessage = `Obrigado por fornecer as informações. Para confirmar, o Problema é: ${data.problemType}, no Bairro: ${data.neighborhood}, Local: ${data.location}, Detalhes: ${data.details}, Detalhes Adicionais: ${data.additionalDetails}. Estão corretas?\n1 Sim!\n2 Não!`;
    client.sendMessage(message.from, confirmationMessage);
};

// Manipula a confirmação dos dados fornecidos
const handleConfirmation = async (message) => {
    const choice = message.body.trim();

    if (choice === '1') {
        const data = userSessions[message.from].data;
        const phoneNumber = message.from; // Número do telefone que enviou a mensagem
        const pdfFile = await generatePdf(data, phoneNumber);

        await client.sendMessage(message.from, `Sua denúncia foi registrada com Sucesso!\nAgradecemos por nos ajudar a melhorar a nossa cidade.\nEm breve retornaremos com mais informações!\nSe precisar de mais alguma coisa, estou aqui para ajudar!`);

        // Enviar o PDF para o usuário
        await client.sendMessage(message.from, { document: fs.createReadStream(pdfFile) });

        delete userSessions[message.from]; // Limpa a sessão após a confirmação
    } else if (choice === '2') {
        userSessions[message.from].step = 'edit';
        client.sendMessage(message.from, `Vamos editar as informações!\nO que está errado?\n1 Problema\n2 Bairro\n3 Local\n4 Detalhes\n5 Detalhes Adicionais`);
    } else {
        client.sendMessage(message.from, `Escolha inválida. Digite "1" para confirmar ou "2" para editar.`);
    }
};

// Manipula a edição dos dados fornecidos
const handleEdit = async (message) => {
    const choice = message.body.trim();

    switch (choice) {
        case '1':
            userSessions[message.from].step = 'problemType';
            client.sendMessage(message.from, `Me informe o tipo de problema correto:\n1 Lixo e limpeza\n2 Segurança pública\n3 Infraestrutura\n4 Saúde\n5 Educação\n6 Outros (Esporte, Cultura, Lazer, etc...)`);
            break;
        case '2':
            userSessions[message.from].step = 'neighborhood';
            client.sendMessage(message.from, `Me informe o Bairro correto:`);
            break;
        case '3':
            userSessions[message.from].step = 'location';
            client.sendMessage(message.from, `Me informe o Local correto:`);
            break;
        case '4':
            userSessions[message.from].step = 'details';
            client.sendMessage(message.from, `Me informe os Detalhes corretos:`);
            break;
        case '5':
            userSessions[message.from].step = 'additionalDetails';
            client.sendMessage(message.from, `Me informe os Detalhes Adicionais corretos:`);
            break;
        default:
            client.sendMessage(message.from, `Escolha inválida. Digite um número de 1 a 5.`);
            break;
    }
};

// Manipula a entrada das informações para edição
const handleEditInformation = async (message) => {
    const choice = message.body.trim();

    switch (choice) {
        case '1':
            userSessions[message.from].step = 'problemType';
            client.sendMessage(message.from, `Me informe o tipo de problema correto:\n1 Lixo e limpeza\n2 Segurança pública\n3 Infraestrutura\n4 Saúde\n5 Educação\n6 Outros (Esporte, Cultura, Lazer, etc...)`);
            break;
        case '2':
            userSessions[message.from].step = 'neighborhood';
            client.sendMessage(message.from, `Me informe o Bairro correto:`);
            break;
        case '3':
            userSessions[message.from].step = 'location';
            client.sendMessage(message.from, `Me informe o Local correto:`);
            break;
        case '4':
            userSessions[message.from].step = 'details';
            client.sendMessage(message.from, `Me informe os Detalhes corretos:`);
            break;
        case '5':
            userSessions[message.from].step = 'additionalDetails';
            client.sendMessage(message.from, `Me informe os Detalhes Adicionais corretos:`);
            break;
        default:
            client.sendMessage(message.from, `Escolha inválida. Digite um número de 1 a 5.`);
            break;
    }
};

// Gerencia a mensagem recebida
client.on('message', async (message) => {
    if (!userSessions[message.from]) {
        startConversation(message);
    } else {
        switch (userSessions[message.from].step) {
            case 'name':
                handleName(message);
                break;
            case 'neighborhood':
                handleNeighborhood(message);
                break;
            case 'problemType':
                handleProblemType(message);
                break;
            case 'location':
                handleLocation(message);
                break;
            case 'details':
                handleDetails(message);
                break;
            case 'additionalDetails':
                handleAdditionalDetails(message);
                break;
            case 'confirmation':
                handleConfirmation(message);
                break;
            case 'edit':
                handleEdit(message);
                break;
            case 'editInformation':
                handleEditInformation(message);
                break;
            default:
                client.sendMessage(message.from, `Desculpe, não entendi a sua solicitação. Por favor, tente novamente.`);
                break;
        }
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.initialize();
