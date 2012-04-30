# Code from http://www.mayin.org/ajayshah/KB/R/

# FIRST LEARN ABOUT LISTS --
X = list(height=5.4, weight=54)
print("Use default printing --")
print(X)
print("Accessing individual elements --")
cat("Your height is ", X$height, " and your weight is ", X$weight, "\n")

# FUNCTIONS --
square <- function(x) {
  return(x*x)
}
cat("The square of 3 is ", square(3), "\n")

                 # default value of the arg is set to 5.
cube <- function(x=5) {
  return(x*x*x);
}
cat("Calling cube with 2 : ", cube(2), "\n")    # will give 2^3
cat("Calling cube        : ", cube(), "\n")     # will default to 5^3.

# LEARN ABOUT FUNCTIONS THAT RETURN MULTIPLE OBJECTS --
powers <- function(x) {
  parcel = list(x2=x*x, x3=x*x*x, x4=x*x*x*x);
  return(parcel);
}

X = powers(3);
print("Showing powers of 3 --"); print(X);

# WRITING THIS COMPACTLY (4 lines instead of 7)

powerful <- function(x) {
  return(list(x2=x*x, x3=x*x*x, x4=x*x*x*x));
}
print("Showing powers of 3 --"); print(powerful(3));

# In R, the last expression in a function is, by default, what is
# returned. So you could equally just say:
powerful <- function(x) {list(x2=x*x, x3=x*x*x, x4=x*x*x*x)}

