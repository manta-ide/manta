// Utility functions
class Utils {
  static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  static isPalindrome(str: string): boolean {
    const cleanStr = str.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanStr === cleanStr.split('').reverse().join('');
  }

  static factorial(n: number): number {
    if (n < 0) throw new Error('Factorial not defined for negative numbers');
    return n <= 1 ? 1 : n * this.factorial(n - 1);
  }
}

// Data structures
interface User {
  id: number;
  name: string;
  age: number;
}

interface Product {
  id: number;
  name: string;
  price: number;
}

// Simple data store
class Store {
  private users: User[] = [];
  private products: Product[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  addProduct(product: Product): void {
    this.products.push(product);
  }

  getUsers(): User[] {
    return this.users;
  }

  getProducts(): Product[] {
    return this.products;
  }

  getAverageAge(): number {
    return this.users.length ? this.users.reduce((sum, u) => sum + u.age, 0) / this.users.length : 0;
  }

  getTotalValue(): number {
    return this.products.reduce((sum, p) => sum + p.price, 0);
  }
}

// Service class
class Service {
  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  createUser(name: string, age: number): User {
    const user: User = {
      id: Date.now(),
      name: Utils.capitalize(name),
      age
    };
    this.store.addUser(user);
    return user;
  }

  createProduct(name: string, price: number): Product {
    const product: Product = {
      id: Date.now(),
      name: Utils.capitalize(name),
      price: Math.max(0, price)
    };
    this.store.addProduct(product);
    return product;
  }

  getStats(): { userCount: number; avgAge: number; totalValue: number } {
    return {
      userCount: this.store.getUsers().length,
      avgAge: Math.round(this.store.getAverageAge() * 10) / 10,
      totalValue: Math.round(this.store.getTotalValue() * 100) / 100
    };
  }
}

// Demo application
class Demo {
  private store: Store;
  private service: Service;

  constructor() {
    this.store = new Store();
    this.service = new Service(this.store);
  }

  run(): void {
    console.log('=== Simplified TypeScript Demo ===\n');

    // String utilities demo
    console.log('String Utils:');
    console.log(`Capitalize: ${Utils.capitalize('hello world')}`);
    console.log(`Palindrome: radar = ${Utils.isPalindrome('radar')}`);
    console.log(`Palindrome: hello = ${Utils.isPalindrome('hello')}`);

    // Math demo
    console.log('\nMath Utils:');
    console.log(`Factorial of 5: ${Utils.factorial(5)}`);

    // Service demo
    console.log('\nService Demo:');
    const user1 = this.service.createUser('john doe', 25);
    const user2 = this.service.createUser('jane smith', 30);
    console.log('Created users:', [user1, user2]);

    const product1 = this.service.createProduct('laptop', 999.99);
    const product2 = this.service.createProduct('book', 19.99);
    console.log('Created products:', [product1, product2]);

    const stats = this.service.getStats();
    console.log(`Stats: ${stats.userCount} users, avg age ${stats.avgAge}, total value $${stats.totalValue}`);

    console.log('\n=== Demo Complete ===');
  }
}

// Export everything for potential external use
export {
  Utils,
  Store,
  Service,
  Demo,
  type User,
  type Product
};

// Demo function - call this to run the demonstration
export function runDemo(): void {
  const demo = new Demo();
  demo.run();
}

// Uncomment the line below to run the demo automatically
 runDemo();
