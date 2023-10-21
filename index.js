#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const program = require('commander');
const { Source, buildSchema } = require('graphql');
const del = require('del');

function main ({
  schemaFilePath,
  destDirPath,
  assumeValid,
  skipTypes,
} = {}) {
  let assume = false;
  if (assumeValid === 'true') {
    assume = true;
  }

  const typeDef = fs.readFileSync(schemaFilePath, 'utf-8');
  const source = new Source(typeDef);
  const gqlSchema = buildSchema(source, { assumeValidSDL: assume });

  del.sync(destDirPath);
  path.resolve(destDirPath).split(path.sep).reduce((before, cur) => {
    const pathTmp = path.join(before, cur + path.sep);
    if (!fs.existsSync(pathTmp)) {
      fs.mkdirSync(pathTmp);
    }
    return path.join(before, cur + path.sep);
  }, '');

  const skipTypeList = skipTypes ? skipTypes.split(',') : [];
  const skipTypeSet = new Set(skipTypeList);
  const types = gqlSchema.getTypeMap();
  for (const [name, typeDef] of Object.entries(types)) {
    if (!typeDef.astNode) {
      continue;
    }
    const fragmentLines = [];
    if (typeDef.astNode.kind === 'UnionTypeDefinition') {
      const unionTypes = typeDef.getTypes();
      fragmentLines.push('__typename');
      fragmentLines.push(...unionTypes.map(
        ({ name }) => `... on ${name} { ...${name}FragmentAll }`
      ));
    } else if (typeDef.astNode.kind === 'ObjectTypeDefinition') {
      const fields = typeDef.getFields();
      for (const [fieldName, fieldDef] of Object.entries(fields)) {
        let nestedObjectType;
        // Strip off non-null, array, non-null
        let fieldType = fieldDef.type;
        // Strip off non-null and array
        if (fieldType.ofType) {
          fieldType = fieldType.ofType;
        }
        if (fieldType.ofType) {
          fieldType = fieldType.ofType;
        }
        if (fieldType.ofType) {
          fieldType = fieldType.ofType;
        }
        if (fieldType) {
          const fieldTypeKind = fieldType.astNode ? fieldType.astNode.kind : undefined;
          switch (fieldTypeKind) {
            case 'ObjectTypeDefinition':
            case 'UnionTypeDefinition':
              if (!skipTypeSet.has(fieldType.name)) {
                nestedObjectType = fieldType.name;
              } else {
                nestedObjectType = 'skip';
              }
              break; // Add as field with fragment
            case 'EnumTypeDefinition':
            case 'ScalarTypeDefinition':
              break;
            case undefined: // base types like string
              break; // Add as field
            default:
              throw new Error(`Unexpected field type kind ${fieldTypeKind} on ${name}`);
          }
        } else {
          throw new Error(`Unexpected missing field type on ${name}`);
        }
        if (nestedObjectType === 'skip') {
          // Don't include
        } else if (nestedObjectType) {
          fragmentLines.push(`${fieldName} { ... ${nestedObjectType}FragmentAll }`);
        } else {
          fragmentLines.push(fieldName);
        }
      }
    } else {
      continue;
    }
    if (fragmentLines.length === 0) {
      continue;
    }
    const fragmentName = `${name}FragmentAll`;
    const fileName = `${fragmentName}.ts`;
    const fragmentDef = `import { gql } from '@/lib/graphql/generated';
const ${fragmentName} = gql(\`
  fragment ${fragmentName} on ${name} {
${fragmentLines.map(l => `    ${l}`).join('\n')}
  }
\`);
export default ${fragmentName};
`;
    fs.writeFileSync(path.join(destDirPath, fileName), fragmentDef);
  }
}

module.exports = main

if (require.main === module) {
  program
    .option('--schemaFilePath [value]', 'path of your graphql schema file')
    .option('--destDirPath [value]', 'dir you want to store the generated queries')
    // .option('--depthLimit [value]', 'query depth you want to limit (The default is 100)')
    // .option('--assumeValid [value]', 'assume the SDL is valid (The default is false)')
    .option('--skipTypes [value]', 'Comma-separated list of types to not add to fragments')
    // .option('--ext [value]', 'extension file to use', 'gql')
    // .option('-C, --includeDeprecatedFields [value]', 'Flag to include deprecated fields (The default is to exclude)')
    // .option('-R, --includeCrossReferences', 'Flag to include fields that have been added to parent queries already (The default is to exclude)')
    .parse(process.argv);

  return main({...program, fileExtension: program.ext })
}
