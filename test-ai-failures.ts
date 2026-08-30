import { classifyAiError } from './src/lib/ai-failures.server';

const mock400 = {
  status: 400,
  message: 'Invalid request',
};

const result400 = classifyAiError(mock400);
console.log('Status 400 classification:', JSON.stringify(result400));

const mockSchemaError = new Error('ai_invalid_output');
const resultSchema = classifyAiError(mockSchemaError);
console.log('Schema error classification:', JSON.stringify(resultSchema));
