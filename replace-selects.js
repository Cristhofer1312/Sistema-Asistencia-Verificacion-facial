const fs = require('fs');
const path = require('path');

const files = [
  "app/admin/vacaciones/page.tsx",
  "app/admin/usuarios/page.tsx",
  "app/admin/reposos/page.tsx",
  "app/admin/empleados/page.tsx",
  "app/admin/empleados/nuevo/page.tsx",
  "app/admin/consulta/page.tsx",
  "app/admin/auditoria/page.tsx",
  "app/admin/asistencias/page.tsx"
];

for (const file of files) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace opening and closing tags
  content = content.replace(/<select/g, '<Select');
  content = content.replace(/<\/select>/g, '</Select>');
  
  // Add import if not present
  if (!content.includes('import { Select } from "@/components/ui/Select";') && content.includes('<Select')) {
    // find the last import and add it after
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
      const endOfLine = content.indexOf('\n', lastImportIndex);
      content = content.slice(0, endOfLine + 1) + 'import { Select } from "@/components/ui/Select";\n' + content.slice(endOfLine + 1);
    } else {
      content = 'import { Select } from "@/components/ui/Select";\n' + content;
    }
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
}
