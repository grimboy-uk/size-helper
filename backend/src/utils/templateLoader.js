import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load and process HTML template with variable substitution
 * @param {string} templateName - Name of the template file (without .html)
 * @param {Object} variables - Variables to substitute in the template
 * @returns {string} Processed HTML content
 */
export function loadTemplate(templateName, variables = {}) {
  const templatePath = path.join(__dirname, '..', 'views', `${templateName}.html`);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }

  let content = fs.readFileSync(templatePath, 'utf-8');

  // Replace variables in format {{variableName}}
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    content = content.replace(regex, value);
  }

  return content;
}

/**
 * Load a partial template and return its content
 * @param {string} partialName - Name of the partial file
 * @returns {string} Partial content
 */
export function loadPartial(partialName) {
  const partialPath = path.join(__dirname, '..', 'views', 'partials', `${partialName}.html`);

  if (!fs.existsSync(partialPath)) {
    return '';
  }

  return fs.readFileSync(partialPath, 'utf-8');
}

export default { loadTemplate, loadPartial };
