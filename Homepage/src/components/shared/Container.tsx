type ContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export default function Container({ children, className = "" }: ContainerProps) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12 ${className}`}>
      {children}
    </div>
  );
}
