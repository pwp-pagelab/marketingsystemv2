# AI Marketing Workflow

Local web app for a full agency workflow:

1. Client information form or CSV upload
2. Branding analysis from uploaded brand files/links
3. AI strategy, content planning, copywriting, QA, creative direction, final brief, and Excel content plan
4. Graphic design generation for social media posts

## Why GitHub Shows This Page

GitHub is showing this README because this project is a Node/Express web app, not a static GitHub Pages website.

The app will not run by only uploading files to GitHub. It needs a server because it uses:

- `server.js`
- OpenAI API calls
- file uploads
- `.env` environment variables
- generated images and Excel files

Use GitHub to store the code, then deploy it to a Node hosting service such as Render, Railway, Fly.io, or a VPS.

## Setup

1. Copy `.env.example` to `.env`.
2. Add your OpenAI API key inside `.env`.
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm start
```

5. Open:

```text
http://localhost:3000
```

## Deploy From GitHub Using Render

1. Push this repository to GitHub.
2. Go to Render and create a new Web Service from the GitHub repository.
3. Use:

```text
Build Command: npm install
Start Command: npm start
```

4. Add environment variables in Render:

```text
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.2
OPENAI_IMAGE_MAIN_MODEL=gpt-5.2
DESIGN_IMAGE_LIMIT=3
```

5. Deploy.

After deployment, Render will give you a live URL like:

```text
https://your-app-name.onrender.com
```

That is the URL you share with users, not the GitHub repository URL.

## Environment

```text
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.2
PORT=3000
```

Optional:

```text
DESIGN_IMAGE_LIMIT=3
OPENAI_IMAGE_MAIN_MODEL=gpt-5.2
```

## Important

Do not upload `.env`, `node_modules`, `data`, or `public/generated` to GitHub. They are ignored by `.gitignore`.

The branding analyzer is merged into this Node app. It supports uploaded images, PDFs, text files, and website/social links.
