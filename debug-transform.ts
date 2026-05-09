import { BusinessLogicTransformer, TransformContext, extractMethodBody } from './server/engine/BusinessLogicTransformer';
import { readFileSync } from 'fs';

const content = readFileSync('/tmp/test-projects/proj-04-bookstore/AdminBean.java', 'utf-8');

// Extract createStudent body
const body = extractMethodBody(content, 'createStudent');
console.log('=== Extracted body ===');
console.log(body?.substring(0, 300));
console.log('...');
console.log();

if (body) {
  const transformer = new BusinessLogicTransformer();
  const ctx: TransformContext = {
    voInClass: '',
    voOutClass: 'Student',
    requestDtoClass: 'CreateStudentRequest',
    responseDtoClass: 'Student',
    sourceClassName: 'AdminBean_createStudent',
  };
  const result = transformer.transform(body, ctx);
  console.log('=== Transformed body ===');
  console.log(result.body || result.code);
  console.log();
  console.log('Warnings:', result.warnings);
  console.log('Todos:', result.todos?.length);
}
