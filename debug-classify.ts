import { readFileSync } from 'fs';

// Inline the classification functions from java-parser
function isDto(content: string, className: string): boolean {
  if (/Vo(In|Out)$|Dto$/.test(className) && /(private|protected)\s+\w+\s+\w+;/.test(content)) return true;
  if (/implements\s+(ValueObject|Serializable)/.test(content) && /Vo(In|Out)|Dto/.test(className)) return true;
  if (/@Xml(RootElement|AccessorType)/.test(content) && /(private|protected)\s+\w+\s+\w+;/.test(content)) return true;
  return false;
}

function isUseCase(content: string): boolean {
  return /@(Stateless|Stateful|Singleton|MessageDriven)/.test(content) ||
    /extends\s+(SessionBean|MessageDrivenBean)/.test(content) ||
    /implements\s+\w*(SessionBean|MessageDrivenBean)/.test(content);
}

function isService(content: string, className: string): boolean {
  if (isUseCase(content)) return false;
  if (isDto(content, className)) return false;
  if (/Service\b/.test(className) && !/@Remote/.test(content) && !/@interface/.test(content)) return true;
  return false;
}

// Check BillableHour
const bh = readFileSync('/tmp/test-projects/proj-10-jdbc-monolith/BillableHour.java', 'utf-8');
console.log('BillableHour:');
console.log('  isDto:', isDto(bh, 'BillableHour'));
console.log('  isUseCase:', isUseCase(bh));
console.log('  isService:', isService(bh, 'BillableHour'));

// Check User
const user = readFileSync('/tmp/test-projects/proj-10-jdbc-monolith/User.java', 'utf-8');
console.log('User:');
console.log('  isDto:', isDto(user, 'User'));
console.log('  isUseCase:', isUseCase(user));
console.log('  isService:', isService(user, 'User'));

// Check UserDAO
const userDao = readFileSync('/tmp/test-projects/proj-10-jdbc-monolith/UserDAO.java', 'utf-8');
console.log('UserDAO:');
console.log('  isDto:', isDto(userDao, 'UserDAO'));
console.log('  isUseCase:', isUseCase(userDao));
console.log('  isService:', isService(userDao, 'UserDAO'));

// Check ConnectionManager
const cm = readFileSync('/tmp/test-projects/proj-10-jdbc-monolith/ConnectionManager.java', 'utf-8');
console.log('ConnectionManager:');
console.log('  isDto:', isDto(cm, 'ConnectionManager'));
console.log('  isUseCase:', isUseCase(cm));
console.log('  isService:', isService(cm, 'ConnectionManager'));
