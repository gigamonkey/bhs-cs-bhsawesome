public class Person {

  // Instance variables
  private String name;
  private int age;

  // Constructor
  public Person(String name, int age) {
    this.name = name;
    this.age = age;
  }

  // Methods
  public void greet(String to) {
    System.out.println("Hello " + to + ", I'm " + name + ".");
  }

  public boolean canVote() {
    return age >= 18;
  }

  public static void main(String[] args) {
    Person joe = new Person("Joe", 18);
    joe.greet("Sally");
    System.out.println("Joe can vote: " + joe.canVote());
  }
}
