
const SERVER_URL = 'https://rephrase-vastly-fetal.ngrok-free.dev';

function onFormSubmit(e) {
  const responses = e.response.getItemResponses();
  let token = "";

  // Find the question titled "Access Token"
  for (let i = 0; i < responses.length; i++) {
    if (responses[i].getItem().getTitle().toLowerCase().includes("token")) {
      token = responses[i].getResponse();
      break;
    }
  }

  if (!token) return;

  try {
    const response = UrlFetchApp.fetch(SERVER_URL + '/api/validate/' + token);
    const result = JSON.parse(response.getContentText());

    if (!result.valid) {
      console.warn("Invalid submission!");
      // The response is already recorded, but you can mark it or ignore it in your sheet.
    }
  } catch (err) {
    console.error("Validation failed: " + err);
  }
}
