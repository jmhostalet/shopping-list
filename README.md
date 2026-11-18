# Shopping List

The **List** tab contains the fixed products from the PDF, read down each column from left to right. Use **Others** for custom products. Both tabs show item quantities. Swipe right to add one and left to subtract one. You can also tap an item to add one or use its minus button. The account menu can reset every quantity to zero.

The app uses the same Firebase Authentication project as Weights. Personal checklist changes are saved in browser storage under the signed-in Google account.

## Share with family

Open **Account menu → Share list → Create shared list** to start a shared copy of your checklist. Copy the invitation link and send it to your family. They open the link, sign in with Google, and select **Join**. Quantities and custom products sync between members. Joining or returning to your personal list preserves your browser’s personal copy. Save the invitation link if you want to rejoin later.

The invitation grants edit access to any Google account that uses it. Share it only with the people you want to edit the list.

## Enable shared lists in Firebase

In the `weights-41721` project, open **Firestore Database → Rules**. Insert the contents of [shopping.firestore.rules](shopping.firestore.rules) inside the existing `match /databases/{database}/documents` block, alongside the existing app rules, and publish the combined rules. The shopping rules use dedicated collections and can coexist with the Weights rules. The personal checklist continues to work while sharing is unavailable.

## Publish

GitHub Pages deploys the static app from `main` using `.github/workflows/pages.yml`. Under **Settings → Pages**, set the source to **GitHub Actions**. The workflow publishes only the app files.

Google sign-in requires the Pages hostname in **Firebase Authentication → Settings → Authorized domains** and Google enabled as a sign-in provider. If the site moves to another host, authorize its hostname there.
