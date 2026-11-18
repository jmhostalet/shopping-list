# Shopping List

The **List** tab contains the fixed products from the PDF, read down each column from left to right. Use **Others** for custom products. Both tabs have checkboxes. The account menu can clear all checkmarks while keeping the products.

The app uses the same Firebase Authentication project as Weights. Checklist changes are saved in browser storage under the signed-in Google account. They are available when that account signs in again in the same browser.

## Publish

GitHub Pages deploys the static app from `main` using `.github/workflows/pages.yml`. Under **Settings → Pages**, set the source to **GitHub Actions**. The workflow publishes only the app files.

Google sign-in requires the Pages hostname in **Firebase Authentication → Settings → Authorized domains** and Google enabled as a sign-in provider. If the site moves to another host, authorize its hostname there.
