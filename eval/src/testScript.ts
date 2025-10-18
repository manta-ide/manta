// Utility functions and methods
class StringUtils {
  static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  static reverse(str: string): string {
    return str.split('').reverse().join('');
  }

  static isPalindrome(str: string): boolean {
    const cleanStr = str.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanStr === cleanStr.split('').reverse().join('');
  }

  static truncate(str: string, maxLength: number): string {
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }
}

class MathUtils {
  static factorial(n: number): number {
    if (n < 0) throw new Error('Factorial is not defined for negative numbers');
    if (n === 0 || n === 1) return 1;
    return n * this.factorial(n - 1);
  }

  static fibonacci(n: number): number {
    if (n < 0) throw new Error('Fibonacci is not defined for negative numbers');
    if (n === 0) return 0;
    if (n === 1) return 1;
    return this.fibonacci(n - 1) + this.fibonacci(n - 2);
  }

  static isPrime(num: number): boolean {
    if (num <= 1) return false;
    if (num <= 3) return true;
    if (num % 2 === 0 || num % 3 === 0) return false;
    for (let i = 5; i * i <= num; i += 6) {
      if (num % i === 0 || num % (i + 2) === 0) return false;
    }
    return true;
  }

  static gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b);
  }
}

// Data structures and interfaces
interface User {
  id: number;
  name: string;
  email: string;
  age: number;
}

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

class DataProcessor {
  private users: User[] = [];
  private products: Product[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  addProduct(product: Product): void {
    this.products.push(product);
  }

  getUsersByAge(minAge: number): User[] {
    return this.users.filter(user => user.age >= minAge);
  }

  getProductsByCategory(category: string): Product[] {
    return this.products.filter(product => product.category === category);
  }

  getAverageUserAge(): number {
    if (this.users.length === 0) return 0;
    const total = this.users.reduce((sum, user) => sum + user.age, 0);
    return total / this.users.length;
  }

  getTotalProductValue(): number {
    return this.products.reduce((sum, product) => sum + product.price, 0);
  }
}

// Service components that use the utility methods
class UserService {
  private dataProcessor: DataProcessor;

  constructor(dataProcessor: DataProcessor) {
    this.dataProcessor = dataProcessor;
  }

  createUser(name: string, email: string, age: number): User {
    const user: User = {
      id: Date.now(),
      name: StringUtils.capitalize(name),
      email: email.toLowerCase(),
      age
    };
    this.dataProcessor.addUser(user);
    return user;
  }

  getUserSummary(): string {
    const users = this.dataProcessor.getUsersByAge(0);
    const avgAge = this.dataProcessor.getAverageUserAge();
    const totalUsers = users.length;

    return `Total users: ${totalUsers}, Average age: ${avgAge.toFixed(1)}`;
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

class ProductService {
  private dataProcessor: DataProcessor;

  constructor(dataProcessor: DataProcessor) {
    this.dataProcessor = dataProcessor;
  }

  createProduct(name: string, price: number, category: string): Product {
    const product: Product = {
      id: Date.now(),
      name: StringUtils.capitalize(name),
      price: Math.max(0, price), // Ensure price is not negative
      category: StringUtils.capitalize(category)
    };
    this.dataProcessor.addProduct(product);
    return product;
  }

  calculateDiscountedPrice(productId: number, discountPercent: number): number | null {
    const products = this.dataProcessor.getProductsByCategory(''); // Get all products
    const product = products.find(p => p.id === productId);
    if (!product) return null;

    const discount = Math.max(0, Math.min(100, discountPercent)); // Clamp between 0-100
    return product.price * (1 - discount / 100);
  }

  getProductStatistics(): object {
    const allProducts = this.dataProcessor.getProductsByCategory('');
    const totalValue = this.dataProcessor.getTotalProductValue();
    const categories = [...new Set(allProducts.map(p => p.category))];

    return {
      totalProducts: allProducts.length,
      totalValue: totalValue.toFixed(2),
      categories: categories.length,
      averagePrice: allProducts.length > 0 ? (totalValue / allProducts.length).toFixed(2) : '0.00'
    };
  }
}

// Factory component for creating services
class ServiceFactory {
  private dataProcessor: DataProcessor;

  constructor() {
    this.dataProcessor = new DataProcessor();
  }

  createUserService(): UserService {
    return new UserService(this.dataProcessor);
  }

  createProductService(): ProductService {
    return new ProductService(this.dataProcessor);
  }

  getDataProcessor(): DataProcessor {
    return this.dataProcessor;
  }
}

// Main application component that orchestrates everything
class Application {
  private factory: ServiceFactory;
  private userService: UserService;
  private productService: ProductService;

  constructor() {
    this.factory = new ServiceFactory();
    this.userService = this.factory.createUserService();
    this.productService = this.factory.createProductService();
  }

  // Demonstrate the palindrome checker
  runPalindromeDemo(): void {
    const testWords = ['radar', 'hello', 'level', 'world', 'A man a plan a canal Panama'];
    console.log('Palindrome Check Demo:');
    testWords.forEach(word => {
      const isPal = StringUtils.isPalindrome(word);
      console.log(`${word}: ${isPal ? 'Yes' : 'No'}`);
    });
  }

  // Demonstrate math utilities
  runMathDemo(): void {
    console.log('\nMath Utilities Demo:');
    console.log(`Factorial of 5: ${MathUtils.factorial(5)}`);
    console.log(`Fibonacci of 8: ${MathUtils.fibonacci(8)}`);
    console.log(`Is 17 prime: ${MathUtils.isPrime(17)}`);
    console.log(`GCD of 48 and 18: ${MathUtils.gcd(48, 18)}`);
  }

  // Demonstrate user and product services
  runServiceDemo(): void {
    console.log('\nService Demo:');

    // Create users
    const user1 = this.userService.createUser('john doe', 'JOHN@EXAMPLE.COM', 25);
    const user2 = this.userService.createUser('jane smith', 'jane@example.com', 30);
    console.log('Created users:', [user1, user2]);

    // Create products
    const product1 = this.productService.createProduct('laptop', 999.99, 'electronics');
    const product2 = this.productService.createProduct('book', 19.99, 'education');
    console.log('Created products:', [product1, product2]);

    // Show statistics
    console.log('User summary:', this.userService.getUserSummary());
    console.log('Product statistics:', this.productService.getProductStatistics());

    // Calculate discounted price
    const discountedPrice = this.productService.calculateDiscountedPrice(product1.id, 15);
    console.log(`Laptop with 15% discount: $${discountedPrice}`);
  }

  // Run all demos
  run(): void {
    console.log('=== TypeScript Methods and Components Demo ===\n');
    this.runPalindromeDemo();
    this.runMathDemo();
    this.runServiceDemo();
    console.log('\n=== Demo Complete ===');
  }
}

// Export everything for potential external use
export {
  StringUtils,
  MathUtils,
  DataProcessor,
  UserService,
  ProductService,
  ServiceFactory,
  Application,
  type User,
  type Product
};

// Demo function - call this to run the demonstration
export function runDemo(): void {
  const app = new Application();
  app.run();
}

// Uncomment the line below to run the demo automatically
 runDemo();
