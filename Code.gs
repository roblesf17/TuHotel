/**
 * ARCHIVO: Code.gs (Google Apps Script Backend)
 * 
 * Uso: Recibir imágenes (Base64) desde el panel Frontdesk y guardarlas
 * en la carpeta designada de Google Drive para los comprobantes/DNIs.
 */

// ID de la carpeta que nos diste
const FOLDER_ID = '12A_-i9XhVSMfQKx9NQy-JzqEYJo7FJWv';

function doPost(e) {
  // CORS Handling para peticiones preflight (Opcional, pero recomendado)
  if (typeof e === 'undefined' || !e.postData) {
    return createResponse({ error: "No data received" });
  }

  try {
    let payload = JSON.parse(e.postData.contents);
    
    // Si la acción es subir imagen
    if (payload.action === 'upload_image') {
      let base64Data = payload.data; // Formato: "data:image/jpeg;base64,/9j/4AAQSk..."
      let filename = payload.filename || 'adjunto_' + new Date().getTime() + '.jpg';
      
      // Limpiar el header de base64 si existe
      if (base64Data.indexOf(',') > -1) {
        base64Data = base64Data.split(',')[1];
      }
      
      // Decodificar Base64 a un Blob
      let decoded = Utilities.base64Decode(base64Data);
      let blob = Utilities.newBlob(decoded, 'image/jpeg', filename); // Asumimos jpeg por simplicidad, aunque Drive lo auto-detecta bien
      
      // Obtener la carpeta
      let folder = DriveApp.getFolderById(FOLDER_ID);
      
      // Crear el archivo en la carpeta
      let file = folder.createFile(blob);
      
      // Cambiar permisos para que cualquiera con el enlace pueda verlo (Lector Público)
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      // Obtener el ID del archivo
      let fileId = file.getId();
      
      // Construir la URL de thumbnail (funciona en <img> sin CORS)
      let directUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';
      
      return createResponse({
        status: "success", 
        message: "Archivo subido correctamente",
        url: directUrl,
        fileId: fileId
      });
    }
    
    // Si la acción es enviar email (recuperación de contraseña, etc.)
    if (payload.action === 'send_email') {
      MailApp.sendEmail({
        to: payload.to,
        subject: payload.subject,
        htmlBody: payload.body
      });
      return createResponse({ status: "success", message: "Email enviado correctamente" });
    }

    return createResponse({ error: "Acción no reconocida" });
    
  } catch(error) {
    return createResponse({ error: error.toString() });
  }
}

function doGet(e) {
  // Si se pide buscar un archivo por nombre
  if (e && e.parameter && e.parameter.action === 'find_file') {
    try {
      let filename = e.parameter.filename;
      let folder = DriveApp.getFolderById(FOLDER_ID);
      let files = folder.getFilesByName(filename);
      
      if (files.hasNext()) {
        let file = files.next();
        let fileId = file.getId();
        let directUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';
        
        return createResponse({
          status: "success",
          url: directUrl,
          fileId: fileId,
          filename: filename
        });
      }
      
      return createResponse({ status: "not_found", filename: filename });
    } catch(error) {
      return createResponse({ status: "error", error: error.toString() });
    }
  }
  
  return ContentService.createTextOutput("Servidor de Archivos SaaS Activo. Listo para recibir imágenes.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// Función auxiliar para retornar JSON
function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function testEmail() {
  MailApp.sendEmail({
    to: 'roblesf17@gmail.com',
    subject: 'Test desde TuHotel.pe',
    htmlBody: '<h2>¡Funciona!</h2><p>El envío de emails está activo.</p>'
  });
}

