---
title: "100道Golang面试题汇总（基础+并发+GMP+内存管理+垃圾回收）"
date: "2026-6-23"
tags: ["Go", "面试", "八股文", "GMP", "并发编程"]
excerpt: "从基础语法到并发编程，再到内存管理和垃圾回收，覆盖 Go 面试中最常考的知识点"
---

# 100道+Golang面试题（基础+数据类型+并发+GMP+内存管理+垃圾回收）


这篇⽂章把 Go ⾯试中最常考的知识点都整理进来了，从基础语法到并发编程，再到内存管理和垃圾回收，基本覆盖了你在 Go ⾯试中会遇到的绝⼤多数问题。每道题尽量把背后的原理讲清楚，不只是给⼀个结论。
⼏个特别值得花时间搞透的模块：
Slice 和 Map：不只是会⽤，要知道扩容机制、底层结构、并发安全问题，这两个基本是每场⾯试必提。
Channel 和并发：Go 最有特⾊的地⽅，Channel 的收发过程、select 的执⾏机制、各种锁的底层实现，⾯试官特别喜欢在这⾥深挖。
GMP 调度模型：Go ⾼并发的核⼼，P 的作⽤、work-stealing、goroutine 调度时机，这块是 Go 进阶⾯试
的分⽔岭。


GC 垃圾回收：三⾊标记法、写屏障、STW，理解原理⽐死记结论重要得多。
如果你刚开始准备 Go ⾯试，建议先把基础和 Slice/Map/Channel 这些核⼼数据结构吃透，并发和 GMP 相对抽
象，可以结合代码多跑⼏个例⼦来理解。
1. Go基础⾯试题

### 1.1 与其他语⾔相⽐，使⽤ Go 有什么好处?


与其他语⾔不同，Go 代码的设计是务实的，Go的语法更简洁。每个功能和语法决策都旨在让程序员的开发
效率更⾼
Golang 针对并发进⾏了优化，⽀持协程，并且实现了⾼效的GMP调度模型。
由于单⼀的标准代码格式，Golang 通常被认为⽐其他语⾔更具可读性。
有⾼效的垃圾回收机制，⽀持并⾏垃圾回收，垃圾回收效率⽐⽐ Java 或 Python 更⾼

### 1.2 什么是协程？


协程是⽤户态轻量级线程，它是线程调度的基本单位。通常在函数前加上go关键字就能实现并发。⼀个Goroutine
会以⼀个很⼩的栈启动2KB或4KB，当遇到栈空间不⾜时，栈会⾃动伸缩， 因此可以轻易实现成千上万个goroutine
同时启动。

### 1.3 协程和线程和进程的区别？


进程:进程是具有⼀定独⽴功能的程序，进程是系统资源分配和调度的最⼩单位。 每个进程都有⾃⼰的独⽴
内存空间，不同进程通过进程间通信来通信。由于进程⽐较重量，占据独⽴的内存，所以上下⽂进程间的切
换开销（栈、寄存器、虚拟内存、⽂件句柄等）⽐较⼤，但相对⽐较稳定安全。
线程:线程是进程的⼀个实体,线程是内核态,⽽且是 CPU 调度和分派的基本单位,它是⽐进程更⼩的能独⽴运
⾏的基本单位。线程间通信主要通过共享内存，上下⽂切换很快，资源开销较少，但相⽐进程不够稳定容易
丢失数据。
协程:协程是⼀种⽤户态的轻量级线程，协程的调度完全是由⽤户来控制的。协程拥有⾃⼰的寄存器上下⽂和
栈。 协程调度切换时，将寄存器上下⽂和栈保存到其他地⽅，在切回来的时候，恢复先前保存的寄存器上下
⽂和栈，直接操作栈则基本没有内核切换的开销，可以不加锁的访问全局变量，所以上下⽂的切换⾮常快。

### 1.4 Golang 中 make 和 new 的区别？


回答：

make 和 new 都是⽤于内存分配的内建函数，但它们的使⽤场景和功能有所不同：
1. make：
⽤于初始化并分配内存，只能⽤于创建 slice、map 和 channel 三种类型。
返回的是初始化后的数据结构，⽽不是指针。
2. new：
⽤于分配内存，但不初始化，返回的是指向该内存的指针。
可以⽤于任何类型的内存分配。
分析：

    // 使⽤ make 创建 slice
    s := make([]int, 5) // 创建⼀个⻓度为 5 的 slice
    fmt.Println(s) // 输出: [0 0 0 0 0]// 使⽤ new 创建 int 指针
    p := new(int) // 分配内存给 int 类型
    fmt.Println(*p) // 输出: 0 (初始值)

make 函数创建的是数据结构（slice、map、channel）本⾝，且返回初始化后的值。⽽new 函数创建的是可以指向
任意类型的指针，返回指向未初始化零值的内存地址。

### 1.5 Golang 中数组和切⽚的区别？


数组:
数组固定长度。数组长度是数组类型的⼀部分，所以[3]int 和[4]int 是两种不 同的数组类型数组需要指定⼤⼩，不
指定也会根据初始化，⾃动推算出⼤⼩， ⼤⼩不可改变。数组是通过值传递的
切⽚:
切⽚可以改变长度。切⽚是轻量级的数据结构，三个属性，指针，长度，容量 不需要指定⼤⼩切⽚是地址传递(引
⽤传递)可以通过数组来初始化，也可以通过内置函数 make()来初始化，初始化的时候 len=cap，然后进⾏扩容
分析：
slice 的底层数据其实也是数组，slice 是对数组的封装，它描述⼀个数组的⽚段。slice 实际上是⼀个结构体，包含
三个字段：长度、容量、底层数组。

    // runtime/slice.go
    type slice struct {

    array unsafe.Pointer // 元素指针
    len int // ⻓度
    cap int // 容量
    }

![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0010_img00.png)

### 1.6 使⽤for range 的时候，它的地址会发⽣变化吗？


在Go1.22之前，对于 for range 循环中的迭代变量，其内存地址是不会发⽣变化的。但是，Go1.22之后的地址是
临时的，是变化的，不⼀样的，不再是共享内存了
分析：
Go1.22之前：

    for index, value := range collection {
    // ...
    }


这⾥ value 是⼀个副本。在每次迭代中，collection 中的当前元素值会被复制到 value 这个变量中。Go 编译器
通常会为 value 分配⼀块固定的内存地址，然后在每次迭代时，将当前元素的值覆盖到这块内存中。所以，当你打
印 &value 时，你会发现它的内存地址在整个循环过程中都是保持不变的。
但是在Go1.23及以后，使⽤ for range 遍历⼀个集合时，迭代变量的地址会发⽣变化。这是因为 for range 每次
迭代时都会重新⽣成迭代变量（如 value），这些变量在内存中是不同的地址

### 1.7 如何⾼效地拼接字符串？


拼接字符串的⽅式有：+ , fmt.Sprintf , strings.Builder, bytes.Buffer, strings.Join
1. "+"
使⽤+操作符进⾏拼接时，会对字符串进⾏遍历，计算并开辟⼀个新的空间来存储原来的两个字符串。
2. fmt.Sprintf
由于采⽤了接⼜参数，必须要⽤反射获取值，因此有性能损耗。
3. strings.Builder：
⽤WriteString()进⾏拼接，内部实现是指针+切⽚，同时String()返回拼接后的字符串，它是直接把[]byte转换为
string，从⽽避免变量拷贝。
4. bytes.Buffer
bytes.Buffer是⼀个⼀个缓冲byte类型的缓冲器，这个缓冲器⾥存放着都是byte，
bytes.buffer底层也是⼀个[]byte切⽚。
5. strings.join
strings.join也是基于strings.builder来实现的,并且可以⾃定义分隔符，在join⽅法内调⽤了b.Grow(n)⽅法，
这个是进⾏初步的容量分配，⽽前⾯计算的n的长度就是我们要拼接的slice的长度，因为我们传⼊切⽚长度固定，
所以提前进⾏容量分配可以减少内存分配，很⾼效。
性能⽐较：

    strings.Join ≈ strings.Builder > bytes.Buffer > "+" > fmt.Sprintf

5种拼接⽅法的实例代码

    func main(){

    a := []string{"a", "b", "c"}
    //⽅式1：+

    ret := a[0] + a[1] + a[2]
    //⽅式2：fmt.Sprintf

    ret := fmt.Sprintf("%s%s%s", a[0],a[1],a[2])
    //⽅式3：strings.Builder
    var sb strings.Builder

    sb.WriteString(a[0])
    sb.WriteString(a[1])
    sb.WriteString(a[2])
    ret := sb.String()
    //⽅式4：bytes.Buffer
    buf := new(bytes.Buffer)
    buf.Write(a[0])
    buf.Write(a[1])
    buf.Write(a[2])
    ret := buf.String()
    //⽅式5：strings.Join
    ret := strings.Join(a,"")


    }

### 1.8 defer 的执⾏顺序是怎样的？defer 的作⽤或者使⽤场景是什么?


defer执⾏顺序和调⽤顺序相反，类似于栈后进先出(LIFO)

    defer 的作⽤是：当 defer 语句被执⾏时，跟在 defer 后⾯的函数会被延迟执⾏。直到 包含该 defer 语句的函数执⾏

完毕时，defer 后的函数才会被执⾏，不论包含 defer 语句的函数是通过 return 正常结束，还是由于 panic 导致的
异常结束。 你可以在⼀个函数中执⾏多条 defer 语句，它们的执⾏顺序与声明顺序相反。

    defer 的常⽤场景:

defer语句经常被⽤于处理成对的操作，如打开、关闭、连接、断开连接、 加锁、释放锁。
通过defer机制，不论函数逻辑多复杂，都能保证在任何执⾏路径下，资 源被释放。
释放资源的defer应该直接跟在请求资源的语句后。
分析：

    func test() int {
    i := 0
    defer func() {
    fmt.Println("defer1")
    }()
    defer func() {

i += 1

    fmt.Println("defer2")
    }()
    return i
    }
    func main() {

    fmt.Println("return", test())
    }
    // 输出：
    // defer2
    // defer1
    // return 0

上⾯这个例⼦中，test返回值并没有修改，这是由于Go的返回机制决定的，执⾏Return语句后，Go会创建⼀个临时
变量保存返回值。如果是有名返回（也就是指明返回值func test() (i int)）

    func test() (i int) {
    i = 0
    defer func() {

i += 1

    fmt.Println("defer2")
    }()
    return i


    }
    func main() {

    fmt.Println("return", test())
    }
    // 输出：
    // defer2
    // return 1

这个例⼦中，返回值被修改了。对于有名返回值的函数，执⾏ return 语句时，并不会再创建临时变量保存，因此，

    defer 语句修改了 i，即对返回值产⽣了影响。

### 1.9 什么是 rune 类型？


Go 语⾔的字符有以下两种：
uint8 类型，或者叫 byte 型，代表了 ASCII 码的⼀个字符。
rune 类型，代表⼀个 UTF-8 字符，当需要处理中⽂、⽇⽂或者其他复合字符时，则需要⽤到 rune 类型。
rune 类型等价于 int32 类型。

    package main
    import "fmt"
    func main() {
    var str = "hello 你好" //思考下 len(str) 的⻓度是多少？
    //golang中string底层是通过byte数组实现的，直接求len 实际是在按字节⻓度计算
    //所以⼀个汉字占3个字节算了3个⻓度

    fmt.Println("len(str):", len(str)) // len(str): 12
    //通过rune类型处理unicode字符

    fmt.Println("rune:", len([]rune(str))) //rune: 8
    }

### 1.10 Go 语⾔ tag 有什么⽤？


tag可以为结构体成员提供属性。常见的：
1. json序列化或反序列化时字段的名称
2. db: sqlx模块中对应的数据库字段名
3. form: gin框架中对应的前端的数据字段名
4. binding: 搭配 form 使⽤, 默认如果没查找到结构体中的某个字段则不报错值为空, binding为 required 代表没
找到返回错误给前端

### 1.11 go 打印时 %v %+v %#v 的区别？


%v 只输出所有的值；
%+v 先输出字段名字，再输出该字段的值；
%#v 先输出结构体名字值，再输出结构体（字段名字+字段的值）；

    package main
    import "fmt"
    type student struct {

    id int32
    name string
    }
    func main() {

    a := &student{id: 1, name: "微客⻦窝"}
    fmt.Printf("a=%v \n", a) // a=&{1 微客⻦窝}
    fmt.Printf("a=%+v \n", a) // a=&{id:1 name:微客⻦窝}
    fmt.Printf("a=%#v \n", a) // a=&main.student{id:1, name:"微客⻦窝"}
    }

### 1.12 Go语⾔中空 struct{} 占⽤空间么？


可以使⽤ unsafe.Sizeof 计算出⼀个数据类型实例需要占⽤的字节数，空struct{}不占⽤任何空间

    package main
    import (

"fmt"
"unsafe"
)

    func main() {

    fmt.Println(unsafe.Sizeof(struct{}{})) //0
    }

### 1.13 Go语⾔中，空 struct{} 有什么⽤？


⽤map模拟⼀个set，那么就要把值置为struct{}，struct{}本⾝不占任何空间，可以避免任何多余的内存分
配。

    type Set map[string]struct{}
    func main() {

    set := make(Set)
    for _, item := range []string{"A", "A", "B", "C"} {

set[item] = struct{}{}

    }

    fmt.Println(len(set)) // 3
    if _, ok := set["A"]; ok {

    fmt.Println("A exists") // A exists
    }
    }

有时候给通道发送⼀个空结构体,channel<-struct{}{}，可以节省空间

    func main() {
    ch := make(chan struct{}, 1)
    go func() {
    <-ch
    // do something
    }()
    ch <- struct{}{}
    // ...
    }

表⽰仅有⽅法的结构体

    type Lamp struct{}

### 1.14 init() 函数是什么时候执⾏的？


简答： 在main函数之前执⾏。
详细：init()函数是go初始化的⼀部分，由runtime初始化每个导⼊的包，初始化不是按照从上到下的导⼊顺序，⽽
是按照解析的依赖关系，没有依赖的包最先初始化。
每个包⾸先初始化包作⽤域的常量和变量（常量优先于变量），然后执⾏包的init()函数。同⼀个包，甚⾄是同⼀
个源⽂件可以有多个init()函数。init()函数没有⼊参和返回值，不能被其他函数调⽤，同⼀个包内多个init()
函数的执⾏顺序不作保证。
执⾏顺序：import –> const –> var –>init()–>main()
⼀个⽂件可以有多个init()函数！


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0016_img00.png)

### 1.15 2 个 interface 可以⽐较吗 ？


Go 语⾔中，interface 的内部实现包含了 2 个字段，类型 T 和 值 V，interface 可以使⽤ == 或 != ⽐较。2 个
interface 相等有以下 2 种情况
1. 两个 interface 均等于 nil（此时 V 和 T 都处于 unset 状态）
2. 类型 T 相同，且对应的值 V 相等。

    type Stu struct {

    Name string
    }
    type StuInt interface{}
    func main() {
    var stu1, stu2 StuInt = &Stu{"Tom"}, &Stu{"Tom"}
    var stu3, stu4 StuInt = Stu{"Tom"}, Stu{"Tom"}

    fmt.Println(stu1 == stu2) // false
    fmt.Println(stu3 == stu4) // true
    }

stu1 和 stu2 对应的类型是 *Stu，值是 Stu 结构体的地址，两个地址不同，因此结果为 false。
stu3 和 stu4 对应的类型是 Stu，值是 Stu 结构体，且各字段相等，因此结果为 true。

### 1.16 2 个 nil 可能不相等吗？


可能不等。interface在运⾏时绑定值，只有值为nil接⼜值才为nil，但是与指针的nil不相等。举个例⼦：

    var p *int = nil
    var i interface{} = nil

    if(p == i){
    fmt.Println("Equal")
    }

两者并不相同。总结：两个nil只有在类型相同时才相等。

### 1.17 Go 语⾔函数传参是值类型还是引⽤类型？


在 Go 语⾔中只存在值传递，要么是值的副本，要么是指针的副本。⽆论是值类型的变量还是引⽤类型的变
量亦或是指针类型的变量作为参数传递都会发⽣值拷贝，开辟新的内存空间。
另外值传递、引⽤传递和值类型、引⽤类型是两个不同的概念，不要混淆了。引⽤类型作为变量传递可以影
响到函数外部是因为发⽣值拷贝后新旧变量指向了相同的内存地址。

### 1.18 如何知道⼀个对象是分配在栈上还是堆上？


Go和C++不同，Go局部变量会进⾏逃逸分析。如果变量离开作⽤域后没有被引⽤，则优先分配到栈上，否则分配
到堆上。那么如何判断是否发⽣了逃逸呢？

    go build -gcflags '-m -m -l' xxx.go.

关于逃逸的可能情况：变量⼤⼩不确定，变量类型不确定，变量分配的内存超过⽤户栈最⼤值，暴露给了外部指
针。

### 1.19 Go语⾔的多返回值是如何实现的？


Go 语⾔的多返回值是通过在函数调⽤栈帧上预留空间并进⾏值复制来实现的。在函数调⽤发⽣时，Go 编译器会计
算出函数所有返回值的总⼤⼩。在为该函数创建栈帧时，就会在调⽤⽅（caller）的栈帧上，为这些返回值预留出连
续的内存空间。
当函数执⾏到 return 语句时，它会将其要返回的各个值复制到这些预留好的栈空间中。函数执⾏完毕后，控制权
返回给调⽤⽅。此时，调⽤⽅可以直接从它⾃⼰的栈帧上（即之前为返回值预留的空间）获取这些返回的值。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0018_img00.png)

### 1.20 Go语⾔中"_"的作⽤


1. 忽略多返回值：在 Go 语⾔中，函数可以返回多个值。如果你只关⼼其中的⼀部分返回值，⽽不需要使⽤其
余的，就可以⽤ _ 来忽略它们，从⽽避免编译器报错
2. 当你导⼊⼀个包时，通常会使⽤它的某个功能。但有时你可能只想执⾏包的 init() 函数（例如，注册驱
动、初始化全局变量等），⽽不需要直接使⽤包中的任何导出成员。这时，你就可以使⽤ _ 来进⾏匿名导⼊
⽰例：

    package main
    import (

"fmt"
_ "net/http/pprof" // 导⼊ pprof 包，只为了执⾏其 init 函数注册 profiling 接⼝
)

    func main() {

    fmt.Println("Application started. Profiling tools are likely registered.")
    // 实际应⽤中，你可能还会启动⼀个 HTTP 服务器来暴露 pprof 接⼝
    // go func() {
    // log.Println(http.ListenAndServe("localhost:6060", nil))
    // }()
    }

### 1.21 Go语⾔普通指针和unsafe.Pointer有什么区别？


普通指针⽐如*int、*string，它们有明确的类型信息，编译器会进⾏类型检查和垃圾回收跟踪。不同类型的指针
之间不能直接转换，这是Go类型安全的体现。
⽽unsafe.Pointer是Go的通⽤指针类型，可以理解为C语⾔中的void*，它绕过了Go的类型系统。unsafe.Pointer可
以与任意类型的指针相互转换，也可以与uintptr进⾏转换来做指针运算。


另外，通指针受GC管理和类型约束，unsafe.Pointer不受类型约束但仍受GC跟踪

### 1.22 unsafe.Pointer与uintptr有什么区别和联系


unsafe.Pointer和uintptr可以相互转换，这是Go提供的唯⼀合法的指针运算⽅式。典型⽤法是先将unsafe.Pointer转
为uintptr做算术运算，然后再转回unsafe.Pointer使⽤。
最关键的区别在于GC跟踪。unsafe.Pointer会被垃圾回收器跟踪，它指向的内存不会被错误回收；⽽uintptr只是⼀
个普通整数，GC完全不知道它指向什么，如果没有其他引⽤，对应内存可能随时被回收。
所以记住：unsafe.Pointer有GC保护，uintptr没有，这是它们最本质的区别。
2. Slice⾯试题

### 2.1 slice的底层结构是怎样的？


slice 的底层数据其实也是数组，slice 是对数组的封装，它描述⼀个数组的⽚段。slice 实际上是⼀个结构体，包含
三个字段：长度、容量、底层数组。

    // runtime/slice.go
    type slice struct {

    array unsafe.Pointer // 元素指针
    len int // ⻓度
    cap int // 容量
    }


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0020_img00.png)

### 2.2 Go语⾔⾥slice是怎么扩容的？


1. 17及以前
1. 如果期望容量⼤于当前容量的两倍就会使⽤期望容量；
2. 如果当前切⽚的长度⼩于 1024 就会将容量翻倍；
3. 如果当前切⽚的长度⼤于 1024 就会每次增加 25% 的容量，直到新容量⼤于期望容量；
Go1.18及以后，引⼊了新的扩容规则：
当原slice容量(oldcap)⼩于256的时候，新slice(newcap)容量为原来的2倍；原slice容量超过256，新slice容量newcap
= oldcap+(oldcap+3*256)/4

### 2.3 从⼀个切⽚截取出另⼀个切⽚，修改新切⽚的值会影响原来的切⽚内


容吗
在截取完之后，如果新切⽚没有触发扩容，则修改切⽚元素会影响原切⽚，如果触发了扩容则不会。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0021_img00.png)


⽰例：

    package main
    import "fmt"func main() {

    slice := []int{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
    s1 := slice[2:5]
    s2 := s1[2:6:7]
    s2 = append(s2, 100)
    s2 = append(s2, 200)

s1[2] = 20

    fmt.Println(s1)
    fmt.Println(s2)
    fmt.Println(slice)
    }

运⾏结果：
[2 3 20]
[4 5 6 7 100 200]
[0 1 2 3 20 5 6 7 100 9]
s1 从 slice 索引2（闭区间）到索引5（开区间，元素真正取到索引4），长度为3，容量默认到数组结尾，为8。 s2
从 s1 的索引2（闭区间）到索引6（开区间，元素真正取到索引5），容量到索引7（开区间，真正到索引6），为
5。
接着，向 s2 尾部追加⼀个元素 100：

    s2 = append(s2, 100)

s2 容量刚好够，直接追加。不过，这会修改原始数组对应位置的元素。这⼀改动，数组和 s1 都可以看得到。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0022_img00.png)


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0022_img01.png)


再次向 s2 追加元素200

    s2 = append(s2, 200)

这时，s2 的容量不够⽤，该扩容了。于是，s2 另起炉灶，将原来的元素复制新的位置，扩⼤⾃⼰的容量。并且为
了应对未来可能的 append 带来的再⼀次扩容，s2 会在此次扩容的时候多留⼀些 buffer，将新的容量将扩⼤为原
始容量的2倍，也就是10了。
最后，修改 s1 索引为2位置的元素：
s1[2] = 20
这次只会影响原始数组相应位置的元素。它影响不到 s2 了，⼈家已经远⾛⾼飞了。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0023_img00.png)


再提⼀点，打印 s1 的时候，只会打印出 s1 长度以内的元素。所以，只会打印出3个元素，虽然它的底层数组不⽌3
个元素。

### 2.4 slice作为函数参数传递，会改变原slice吗？


当 slice 作为函数参数时，因为会拷贝⼀份新的slice作为实参，所以原来的 slice 结构并不会被函数中的操作改变，
也就是说，slice 其实是⼀个结构体，包含了三个成员：len, cap, array并不会变化。但是需要注意的是，尽管slice结
构不会变，但是其底层数组的数据如果有修改的话，则会发⽣变化。若传的是 slice 的指针，则原 slice 结构会变，
底层数组的数据也会变。
⽰例：

    package main
    func main() {

    s := []int{1, 1, 1}
    f(s)
    fmt.Println(s)
    }
    func f(s []int) {
    // i只是⼀个副本，不能改变s中元素的值
    /*for _, i := range s {

i++

    }

- /

    for i := range s {

s[i] += 1

    }
    }


程序输出：


[2 2 2]
果真改变了原始 slice 的底层数据。这⾥传递的是⼀个 slice 的副本，在 f 函数中，s 只是 main 函数中 s 的⼀个拷
贝。在f 函数内部，对 s 的作⽤并不会改变外层 main 函数的 s的结构。
要想真的改变外层 slice，只有将返回的新的 slice 赋值到原始 slice，或者向函数传递⼀个指向 slice 的指针。我们
再来看⼀个例⼦：

    package main
    import "fmt"
    func myAppend(s []int) []int {
    // 这⾥ s 虽然改变了，但并不会影响外层函数的 s

    s = append(s, 100)
    return s
    }
    func myAppendPtr(s *[]int) {
    // 会改变外层 s 本身

- s = append(*s, 100)

    return
    }
    func main() {

    s := []int{1, 1, 1}
    newS := myAppend(s)
    fmt.Println(s)
    fmt.Println(newS)
    s = newS
    myAppendPtr(&s)
    fmt.Println(s)
    }

程序输出
[1 1 1]
[1 1 1 100]
[1 1 1 100 100]
myAppend 函数⾥，虽然改变了 s，但它只是⼀个值传递，并不会影响外层的 s，因此第⼀⾏打印出来的结果仍然是
[1 1 1]。
⽽ newS 是⼀个新的 slice，它是基于 s 得到的。因此它打印的是追加了⼀个 100 之后的结果： [1 1 1 100]。
最后，将 newS 赋值给了 s，s 这时才真正变成了⼀个新的slice。之后，再给 myAppendPtr 函数传⼊⼀个 s 指针，
这回它真的被改变了：[1 1 1 100 100]


3. Map⾯试题

### 3.1 Go语⾔Map的底层实现原理是怎样的？


map的就是⼀个hmap的结构。Go Map的底层实现是⼀个哈希表。它在运⾏时表现为⼀个指向hmap结构体的指针，
hmap中记录了桶数组指针buckets、溢出桶指针以及元素个数等字段。每个桶是⼀个bmap结构体，能存储8个键值
对和8个tophash，并有指向下⼀个溢出桶的指针overflow。为了内存紧凑，bmap中采⽤的是先存8个键再存8个值
的存储⽅式。
分析：
hmap结构定义：

    // A header for a Go map.
    type hmap struct {

    count int // map中元素个数
    flags uint8 // 状态标志位，标记map的⼀些状态
    B uint8 // 桶数以2为底的对数，即B=log_2(len(buckets))，⽐如B=3，那么桶数为2^3=8
    noverflow uint16 //溢出桶数量近似值
    hash0 uint32 // 哈希种⼦
    buckets unsafe.Pointer // 指向buckets数组的指针
    oldbuckets unsafe.Pointer // 是⼀个指向buckets数组的指针，在扩容时，oldbuckets 指向⽼的

buckets数组(⼤⼩为新buckets数组的⼀半)，⾮扩容时，oldbuckets 为空

    nevacuate uintptr // 表示扩容进度的⼀个计数器，⼩于该值的桶已经完成迁移
    extra *mapextra // 指向mapextra 结构的指针，mapextra 存储map中的溢出桶
    }


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0026_img00.png)


bmap结构如下：


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0027_img00.png)

### 3.2 Go语⾔Map的遍历是有序的还是⽆序的？


Go语⾔⾥Map的遍历是完全随机的，并没有固定的顺序。map每次遍历,都会从⼀个随机值序号的桶,在每个桶中，
再从按照之前选定随机槽位开始遍历,所以是⽆序的。

### 3.3 Go语⾔Map的遍历为什么要设计成⽆序的？


map 在扩容后，会发⽣ key 的搬迁，原来落在同⼀个 bucket 中的 key，搬迁后，有些 key 就要远⾛⾼飞了
（bucket 序号加上了 2^B）。⽽遍历的过程，就是按顺序遍历 bucket，同时按顺序遍历 bucket 中的 key。搬迁
后，key 的位置发⽣了重⼤的变化，有些 key 飞上⾼枝，有些 key 则原地不动。这样，遍历 map 的结果就不可能
按原来的顺序了。
Go团队为了避免开发者写出依赖底层实现细节的脆弱代码，⽽有意为之的⼀个设计。通过在遍历时引⼊随机数，
Go从根本上杜绝了程序员依赖特定遍历顺序的可能性，强制我们写出更健壮的代码。

### 3.4 Map如何实现顺序读取？


如果业务上确实需要有序遍历，最规范的做法就是将Map的键（Key）取出来放⼊⼀个切⽚（Slice）中，⽤sort包
对切⽚进⾏排序，然后根据这个有序的切⽚去遍历Map。

    package main
    import (

"fmt"
"sort"
)

    func main() {
    keyList := make([]int, 0)
    m := map[int]int{

3: 200,
4: 200,
1: 100,
8: 800,
5: 500,
2: 200,

    }
    for key := range m {

    keyList = append(keyList, key)
    }

    sort.Ints(keyList)
    for _, key := range keyList {

    fmt.Println(key, m[key])
    }
    }

### 3.5 Go语⾔的Map是否是并发安全的？


map 不是线程安全的。
在查找、赋值、遍历、删除的过程中都会检测写标志，⼀旦发现写标志置位（等于1），则直接 panic。赋值和删除
函数在检测完写标志是复位之后，先将写标志位置位，才会进⾏之后的操作。


检测写标志：

    if h.flags&hashWriting == 0 {

    throw("concurrent map writes")
    }

设置写标志：

    h.flags |= hashWriting

### 3.6 Map的Key⼀定要是可⽐较的吗？为什么？


Map的Key必须要可⽐较。
⾸先，Map会对我们提供的Key进⾏哈希运算，得到⼀个哈希值。这个哈希值决定了这个键值对⼤概存储在哪个位
置（也就是哪个"桶"⾥）。然⽽，不同的Key可能会产⽣相同的哈希值，这就是"哈希冲突"。当多个Key被定位到同
⼀个"桶"⾥时，Map就没法只靠哈希值来区分它们了。此时，它必须在桶内进⾏逐个遍历，⽤我们传⼊的Key和桶
⾥已有的每⼀个Key进⾏**相等（==）**⽐较。这样才能确保我们操作的是正确的键值对。

### 3.7 Go语⾔Map的扩容时机是怎样的？


向 map 插⼊新 key 的时候，会进⾏条件检测，符合下⾯这 2 个条件，就会触发扩容
1. 装载因⼦超过阈值，源码⾥定义的阈值是 6.5，这个时候会触发双倍扩容
2. overflow 的 bucket 数量过多：
1. 当 B ⼩于 15，也就是 bucket 总数 2^B ⼩于 2^15 时，如果 overflow 的 bucket 数量超过 2^B；
2. 当 B >= 15，也就是 bucket 总数 2^B ⼤于等于 2^15，如果 overflow 的 bucket 数量超过 2^15
这两种情况下会触发等量扩容

### 3.8 Go语⾔Map的扩容过程是怎样的？


Go的扩容是渐进式（gradual）的。它不会在触发扩容时"stop the world"来⼀次性把所有数据搬迁到新空间，⽽是
只分配新空间，然后在后续的每⼀次插⼊、修改或删除操作时，才会顺便搬迁⼀两个旧桶的数据。这种设计将庞⼤
的扩容成本分摊到了多次操作中，极⼤地减少了服务的瞬间延迟（STW），保证了性能的平滑性。
如果是触发双倍扩容，会新建⼀个buckets数组，新的buckets数量⼤⼩是原来的2倍，然后旧buckets数据搬迁到新
的buckets。如果是等量扩容，buckets数量维持不变，重新做⼀遍类似双倍扩容的搬迁动作，把松散的键值对重新
排列⼀次，使得同⼀个 bucket 中的 key 排列地更紧密，这样节省空间，存取效率更⾼

### 3.9 可以对Map的元素取地址吗？


⽆法对 map 的 key 或 value 进⾏取址。会发⽣编译报错，这样设计主要是因为map⼀旦发⽣扩容，key 和 value 的
位置就会改变，之前保存的地址也就失效了。
⽰例：

    package main
    import "fmt"
    func main() {

    m := make(map[string]int)
    fmt.Println(&m["qcrao"])
    }

会出现编译报错：
./main.go:8:14: cannot take the address of m["qcrao"]

### 3.10 Map 中删除⼀个 key，它的内存会释放么？


不会，delete⼀个key，并不会⽴刻释放或收缩Map占⽤的内存。具体来说，delete(m, key) 这个操作，只是把
key和value对应的内存块标记为"空闲"，让它们的内容可以被后续的垃圾回收（GC）处理掉。但是，Map底层为了
存储这些键值对⽽分配的"桶"（buckets）数组，它的规模是不会缩⼩的。只有在置空这个map的时候，整个map的
空间才会被垃圾回后释放


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0031_img00.png)

### 3.11 Map可以边遍历边删除吗


map 并不是⼀个线程安全的数据结构。如果多个线程边遍历，边删除，同时读写⼀个 map 是未定义的⾏为，如果
被检测到，会直接 panic。
如果是发⽣在多个协程同时读写同⼀个 map 的情况下。 如果在同⼀个协程内边遍历边删除，并不会检测到同时读
写，理论上是可以这样做的。但是，遍历的结果就可能不会是相同的了，有可能结果遍历结果集中包含了删除的
key，也有可能不包含，这取决于删除 key 的时间：是在遍历到 key 所在的 bucket 时刻前或者后。这种情况
下，可以通过加读写锁sync.RWMutex来保证
4. Channel⾯试题

### 4.1 什么是CSP？


CSP（Communicating Sequential Processes，通信顺序进程）并发编程模型，它的核⼼思想是：通过通信共享内
存，⽽不是通过共享内存来通信。Go 语⾔的Goroutine 和 Channel机制，就是 CSP 的经典实现，具有以下特点：
1. 避免共享内存：协程（Goroutine）不直接修改变量，⽽是通过 Channel 通信
2. 天然同步：Channel 的发送/接收⾃带同步机制，⽆需⼿动加锁


3. 易于组合：Channel 可以嵌套使⽤，构建复杂并发模式（如管道、超时控制）

### 4.2 Channel的底层实现原理是怎样的？


Channel的底层是⼀个名为hchan的结构体，核⼼包含⼏个关键组件：
环形缓冲区：有缓冲channel内部维护⼀个固定⼤⼩的环形队列，⽤buf指针指向缓冲区，sendx和recvx分别记录
发送和接收的位置索引。这样设计能⾼效利⽤内存，避免数据搬移。
两个等待队列sendq和recvq：⽤来管理阻塞的goroutine。sendq存储因channel满⽽阻塞的发送者，recvq存储因
channel空⽽阻塞的接收者。这些队列⽤双向链表实现，当条件满⾜时会唤醒对应的goroutine。
互斥锁：hchan内部有个mutex，所有的发送、接收操作都需要先获取锁，⽤来保证并发安全。虽然看起来可能影
响性能，但Go的调度器做了优化，⼤多数情况下锁竞争并不激烈。
分析：
hchan定义如下：

    type hchan struct {
    // chan ⾥元素数量

    qcount uint
    // chan 底层循环数组的⻓度

    dataqsiz uint
    // 指向底层循环数组的指针
    // 只针对有缓冲的 channel

    buf unsafe.Pointer
    // chan 中元素⼤⼩

    elemsize uint16
    // chan 是否被关闭的标志

    closed uint32
    // chan 中元素类型

    elemtype *_type // element type
    // 已发送元素在循环数组中的索引

    sendx uint // send index
    // 已接收元素在循环数组中的索引

    recvx uint // receive index
    // 等待接收的 goroutine 队列

    recvq waitq // list of recv waiters
    // 等待发送的 goroutine 队列

    sendq waitq // list of send waiters
    // 保护 hchan 中所有字段

    lock mutex
    }


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0033_img00.png)

### 4.3 向channel发送数据的过程是怎样的？


向channel发送数据的整个过程都会在mutex保护下进⾏，保证并发安全。会经历⼏个关键步骤：
1. ⾸先是检查是否有等待的接收者。如果recvq队列不为空，说明有goroutine在等待接收数据，这时会直接把
数据传递给等待的接收者，跳过缓冲区，这是最⾼效的路径。同时会唤醒对应的goroutine继续执⾏。
2. 如果没有等待接收者，就尝试写⼊缓冲区。检查缓冲区是否还有空间，如果qcount < dataqsiz，就把数据
复制到buf[sendx]位置，然后更新sendx索引和qcount计数。这是⽆缓冲或缓冲区未满时的正常流径。
3. 当缓冲区满了就需要阻塞等待。创建⼀个sudog结构体包装当前goroutine和要发送的数据，加⼊到sendq等
待队列中，然后调⽤gopark让当前goroutine进⼊阻塞状态，让出CPU给其他goroutine。
被唤醒后继续执⾏。当有接收者从channel读取数据后，会从sendq中唤醒⼀个等待的发送者，被唤醒的goroutine
会完成数据发送并继续执⾏。
还有个特殊情况是向已关闭的channel发送数据会直接panic。这是Go语⾔的设计原则，防⽌向已关闭的通道写⼊数
据。
分析：

    package main


    import (

"fmt"
"time"
)

    func goroutineA(a <-chan int) {
    val := <-a
    fmt.Println("goroutine A received data: ", val)
    return
    }
    func goroutineB(b <-chan int) {

    val := <-b
    fmt.Println("goroutine B received data: ", val)
    return
    }
    func main() {

    ch := make(chan int)
    go goroutineA(ch)
    go goroutineB(ch)
    ch <- 3
    time.Sleep(time.Second)
    ch1 := make(chan struct{})
    }

在第 17 ⾏，主协程向 ch 发送了⼀个元素 3，来看下接下来会发⽣什么。
sender 发现 ch 的 recvq ⾥有 receiver 在等待着接收，就会出队⼀个 sudog，把 recvq ⾥ first 指针的 sudo "推举"出
来了，并将其加⼊到 P 的可运⾏ goroutine 队列中。然后，sender 把发送元素拷贝到 sudog 的 elem 地址处，最后
会调⽤ goready 将 G1 唤醒，状态变为 runnable。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0035_img00.png)


当调度器光顾 G1 时，将 G1 变成 running 状态，执⾏ goroutineA 接下来的代码。G 表⽰其他可能有的
goroutine。
这⾥其实涉及到⼀个协程写另⼀个协程栈的操作。有两个 receiver 在 channel 的⼀边虎视眈眈地等着，这时
channel 另⼀边来了⼀个 sender 准备向 channel 发送数据，为了⾼效，⽤不着通过 channel 的 buf "中转"⼀次，直
接从源地址把数据 copy 到⽬的地址就可以了，效率⾼啊！


![图解](images_golang/page0036_img00.png)


上图是⼀个⽰意图，3 会被拷贝到 G1 栈上的某个位置，也就是 val 的地址处，保存在 elem 字段。

### 4.4 从Channel读取数据的过程是怎样的？


从channel读取数据也有⼏个关键步骤：
1. ⾸先检查是否有等待的发送者。如果sendq队列不为空，说明有goroutine在等待发送数据。对于⽆缓冲
channel，会直接从发送者那⾥接收数据；对于有缓冲channel，会先从缓冲区取数据，然后把等待发送者的
数据放⼊缓冲区，这样保持FIFO顺序。
2. 如果没有等待发送者，尝试从缓冲区读取。检查qcount > 0，如果缓冲区有数据，就从buf[recvx]位置取
出数据，然后更新recvx索引和qcount计数。这是缓冲区有数据时的正常路径。
缓冲区为空时需要阻塞等待。创建sudog结构体包装当前goroutine，加⼊到recvq等待队列，调⽤gopark进⼊阻塞
状态。当有发送者写⼊数据时会被唤醒继续执⾏。
从已关闭channel读取有特殊处理。如果channel已关闭且缓冲区为空，会返回零值和false标志；如果缓冲区还有数
据，可以正常读取直到清空。这就是为什么v, ok := <-ch中的ok能判断channel状态的原因。

### 4.5 从⼀个已关闭Channel仍能读出数据吗？


从⼀个有缓冲的 channel ⾥读数据，当 channel 被关闭，依然能读出有效值。只有当返回的 ok 为 false 时，读出的
数据才是⽆效的。


⽰例：

    func main() {
    ch := make(chan int, 5)
    ch <- 18
    close(ch)
    x, ok := <-ch
    if ok {

    fmt.Println("received: ", x)
    }

    x, ok = <-ch
    if !ok {

    fmt.Println("channel closed, data invalid.")
    }
    }

程序输出：
received: 18

    channel closed, data invalid.

先创建了⼀个有缓冲的 channel，向其发送⼀个元素，然后关闭此 channel。之后两次尝试从 channel 中读取数据，
第⼀次仍然能正常读出值。第⼆次返回的 ok 为 false，说明 channel 已关闭，且通道⾥没有数据。

### 4.6 Channel在什么情况下会引起内存泄漏？


Channel引起内存泄漏最常见的是引起goroutine泄漏从⽽导致的间接内存泄漏，当goroutine阻塞在channel操作上
永远⽆法退出时，goroutine本⾝和它引⽤的所有变量都⽆法被GC回收。⽐如⼀个goroutine在等待接收数据，但发
送者已经退出了，这个接收者就会永远阻塞下去。或者select语句使⽤不当，在没有default分⽀的select中，如果所
有case都⽆法执⾏，goroutine会永远阻塞。出现内存泄漏

### 4.7 关闭Channel会产⽣异常吗？


试图重复关闭⼀个channel、，关闭⼀个nil值的channel、关闭⼀个只有接收⽅向的channel都将导致panic异常。

### 4.8 往⼀个关闭的Channel写⼊数据会发⽣什么？


往已关闭的channel写⼊数据会直接panic。


向已关闭的channel发送数据时，runtime会检测到channel的closed标志位已经设置，⽴即抛出"send on closed
channel"的panic。这个检查发⽣在发送操作的最开始阶段，甚⾄在获取mutex锁之前就会进⾏判断，所以不会有任
何数据写⼊的尝试，直接就panic了。

### 4.9 什么是select？


select是Go语⾔专门为channel操作设计的多路复⽤控制结构，类似于⽹络编程中的select系统调⽤。
核⼼作⽤是同时监听多个channel操作。当有多个channel都可能有数据收发时，select能够选择其中⼀个可执⾏的
case进⾏操作，⽽不是按顺序逐个尝试。⽐如同时监听数据输⼊、超时信号、取消信号等。

### 4.10 select的执⾏机制是怎样的？


select的执⾏机制是随机选择。如果多个case同时满⾜条件，Go会随机选择⼀个执⾏，这避免了饥饿问题。如果没
有case能执⾏就会执⾏default，如果没有default，当前goroutine会阻塞等待。

    select {
    case data := <-ch1:
    // 处理ch1的数据
    case ch2 <- value:
    // 向ch2发送数据
    case <-timeout:
    // 超时处理

    default:
    // 所有channel都不可⽤时执⾏
    }

### 4.11 select的实现原理是怎样的？


Go语⾔实现select时，定义了⼀个数据结构scase表⽰每个case语句(包含default)。scase结构包含channel指针、
操作类型等信息。select操作的整个过程通过selectgo函数在runtime层⾯实现。
Go运⾏时会将所有case进⾏随机排序，这是为了避免饥饿问题。然后执⾏两轮扫描策略：第⼀轮直接检查每个
channel是否可读写，如果找到就绪的⽴即执⾏；如果都没就绪，第⼆轮就把当前goroutine加⼊到所有channel的发
送或接收队列中，然后调⽤gopark进⼊睡眠状态，使当前goroutine让出CPU。
当某个channel变为可操作时，调度器会唤醒对应的goroutine，此时需要从其他channel的等待队列中清理掉这个
goroutine，然后执⾏对应的case分⽀。
其核⼼原理是：case随机化 + 双重循环检测
分析：
scase结构定义：


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0039_img00.png)

    type scase struct {
    c *hchan // channel指针
    elem unsafe.Pointer // 数据元素指针，⽤于存放发送/接收的数据
    kind uint16 // case类型：caseNil、caseRecv、caseSend、caseDefault
    pc uintptr // 程序计数器，⽤于调试
    releasetime int64 // 释放时间，⽤于竞态检测
    }

在默认的情况下，select 语句会在编译阶段经过如下过程的处理：
1. 将所有的 case 转换成包含Channel以及类型等信息的 scase 结构体；
2. 调⽤运⾏时函数 selectgo获取被选择的scase 结构体索引，如果当前的scase是⼀个接收数据的操作，还会
返回⼀个指⽰当前case 是否是接收的布尔值；
3. 通过for循环⽣成⼀组if语句，在语句中判断⾃⼰是不是被选中的 case。
5. Sync⾯试题

### 5.1 除了 mutex 以外还有那些⽅式安全读写共享变量？


除了Mutex，主要还有信号量、通道（Channel），原⼦操作（atomic）这⼏种⽅式。
信号量的实现其实跟mutex差不多，实现起来也很⽅便，主要通过信号量计数来保证。chanenl是Go最推崇的⽅
式，它通过通信来传递数据所有权，从根源上避免竞争，更适合复杂的业务逻辑；⽽原⼦操作则针对最简单的整型
或指针等进⾏⽆锁操作，性能最⾼，常⽤于实现计数器或状态位。选择哪种，完全取决于数据结构的复杂度和业务
的读写模型。

### 5.2 Go 语⾔是如何实现原⼦操作的？


Go语⾔实现原⼦操作，其根本是依赖底层CPU硬件提供的原⼦指令，⽽不是通过操作系统或更上层的锁机制。
具体来说，Go的sync/atomic包中的函数，在编译时会被编译器识别，并直接转换成对应⽬标硬件平台（如x86、
ARM）的单条原⼦机器指令。例如，在x86架构上，atomic.AddInt64这类操作会对应到像LOCK; ADD这样的指
令。前⾯的LOCK前缀是关键，它会锁住总线或缓存⾏，确保后续的ADD指令在执⾏期间，其他CPU核⼼不能访问这
块内存，从⽽保证了整个操作的原⼦性。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0040_img00.png)

### 5.3 聊聊原⼦操作和锁的区别？


原⼦操作和锁最核⼼的区别在于它们的实现层级和保护范围。
原⼦操作是CPU硬件层⾯的"微观"机制，它保证对单个数据（通常是整型或指针）的单次读改写操作是绝对不可分
割的，性能极⾼，因为它不涉及操作系统内核的介⼊和goroutine的挂起。
锁则是操作系统或语⾔运⾏时提供的"宏观"机制，它保护的是⼀个代码块（临界区），⽽不仅仅是单个变量。当获
取锁失败时，它会让goroutine休眠，⽽不是空耗CPU。虽然锁的开销远⼤于原⼦操作，但它能保护⼀段复杂的、涉
及多个变量的业务逻辑。
所以，对于简单的计数器或标志位更新，⽤原⼦操作追求极致性能；⽽只要需要保护⼀段逻辑或多个变量的⼀致
性，就必须⽤锁。

### 5.4 Go语⾔互斥锁mutex底层是怎么实现的？


mutex底层是通过原⼦操作加信号量来实现的，通过atomic 包中的⼀些原⼦操作来实现锁的锁定，通过信号量来实
现协程的阻塞与唤醒
分析
互斥锁对应的是底层结构是sync.Mutex结构体

    type Mutex struct {
    state int32
    sema uint32
    }

state表⽰锁的状态，有锁定、被唤醒、饥饿模式等，并且是⽤state的⼆进制位来标识的，不同模式下会有不同的处
理⽅式


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0041_img00.png)


sema表⽰信号量，mutex阻塞队列的定位是通过这个变量来实现的，从⽽实现goroutine的阻塞和唤醒

### 5.5 Mutex 有⼏种模式？


Go的Mutex主要有两种模式：正常模式（Normal Mode）和饥饿模式（Starvation Mode）。
1. 正常模式：这是默认模式，讲究的是性能。新请求锁的goroutine会和等待队列头部的goroutine竞争，新来
的goroutine有⼏次"⾃旋"的机会，如果在此期间锁被释放，它就可以直接抢到锁。这种⽅式吞吐量⾼，但可
能会导致队列头部的goroutine等待很久，即"不公平"。
2. 饥饿模式：当⼀个goroutine在等待队列中等待超过1毫сан（1ms）后，Mutex就会切换到此模式，讲究的是
公平。在此模式下，锁的所有权会直接从解锁的goroutine移交给等待队列的头部，新来的goroutine不会⾃
旋，必须排到队尾。这样可以确保队列中的等待者不会被"饿死"。
当等待队列为空，或者⼀个goroutine拿到锁时发现它的等待时间⼩于1ms，饥饿模式就会结束，切换回正常模式。
这两种模式的动态切换，是Go在性能和公平性之间做的精妙平衡。

### 5.6 在Mutex上⾃旋的goroutine 会占⽤太多资源吗


并不会，因为Go的⾃旋设计得⾮常"克制"和"智能"。


⾸先，⾃旋不是⽆休⽌的空转，它有严格的次数和时间限制，通常只持续⼏⼗纳秒。其次，⾃旋仅仅在特定条件下
才会发⽣，⽐如CPU核数⼤于1，并且当前机器不算繁忙（没有太多goroutine在排队）。它是在赌，与其付
出"goroutine挂起和唤醒"这种涉及内核调度的巨⼤代价，不如原地"稍等⼀下"，因为锁可能马上就释放了。
所以，这种⾃旋是⼀种机会主义的短线优化，⽬的是⽤极⼩的CPU开销去避免⼀次昂贵的上下⽂切换，在锁竞争不
激烈、占⽤时间极短的场景下，它反⽽是节省了资源。

### 5.7 Mutex 已经被⼀个 Goroutine 获取了, 其它等待中的 Goroutine 们只能


⼀直等待。那么等这个锁释放后，等待中的 Goroutine 中哪⼀个会优先
获取 Mutex 呢?
取决于Mutex当前处于正常模式还是饥饿模式。
在正常模式下，锁的分配是"不公平"的。当锁被释放时，等待队列中的第⼀个goroutine会被唤醒，但它不⼀定能拿
到锁。它需要和那些此刻刚刚到达、正在⾃旋的新goroutine进⾏竞争。新来的goroutine因为正在CPU上运⾏，很
有可能"插队"成功，直接抢到锁。这种策略的优点是吞吐量⾼，但缺点是可能导致等待队列中的goroutine被饿死。
⽽⼀旦Mutex进⼊饥饿模式，锁的分配就变得"绝对公平"。锁被释放后，会直接移交给等待队列的队头goroutine，
任何新来的goroutine都不会参与竞争，必须乖乖排到队尾。

### 5.8 sync.Once 的作⽤是什么，讲讲它的底层实现原理？


sync.Once的作⽤是确保⼀个函数在程序⽣命周期内，⽆论在多少个goroutine中被调⽤，都只会被执⾏⼀次。它常
⽤于单例对象的初始化或⼀些只需要执⾏⼀次的全局配置加载
sync.Once保证代码段只执⾏1次的原理主要是其内部维护了⼀个标识位，当它 == 0 时表⽰还没执⾏过函数，此时
会加锁修改标识位，然后执⾏对应函数。后续再执⾏时发现标识位 != 0，则不会再执⾏后续动作了
分析
Once其实是⼀个结构体

    type Once struct {
    done uint32 // 标识位
    m Mutex
    }

核⼼依赖⼀个uint32的done标志位和⼀个互斥锁Mutex，
当Once.Do(f)⾸次被调⽤时：
1. 它⾸先会通过原⼦操作（atomic.LoadUint32）快速检查done标志位。如果done为1，说明初始化已完成，
直接返回，这个路径完全⽆锁，开销极⼩。
2. 如果done为0，说明可能是第⼀次调⽤，这时它会进⼊⼀个慢路径（doSlow）。


3. 在慢路径⾥，它会先加锁，然后再次检查done标志位。这个"双重检查"（Double-Checked Locking）是关
键，它防⽌了在多个goroutine同时进⼊慢路径时，函数f被重复执⾏。
4. 如果此时done仍然为0，那么当前goroutine就会执⾏传⼊的函数f。执⾏完毕后，它会通过原⼦操作
（atomic.StoreUint32）将done标志位置为1，最后解锁。
之后任何再调⽤Do的goroutine，都会在第⼀步的原⼦Load操作时发现done为1⽽直接返回。整个过程结合了原⼦操
作的速度和互斥锁的安全性，⾼效且线程安全地实现了"仅执⾏⼀次"的保证

### 5.9 WaiGroup 是怎样实现协程等待？


WaitGroup实现等待，本质上是⼀个原⼦计数器和⼀个信号量的协作。
调⽤Add会增加计数值，Done会减计数值。⽽Wait⽅法会检查这个计数器，如果不为零，就利⽤信号量将当前
goroutine⾼效地挂起。直到最后⼀个Done调⽤将计数器清零，它就会通过这个信号量，⼀次性唤醒所有在Wait处
等待的goroutine，从⽽实现等待⽬的。
分析：
waitgroup的结构定义：

    // A WaitGroup waits for a collection of goroutines to finish.
    // The main goroutine calls Add to set the number of goroutines to wait for.
    // Then each of the goroutines runs and calls Done when finished. At the same
    // time, Wait can be used to block until all goroutines have finished.
    //
    // A WaitGroup must not be copied after first use.
    type WaitGroup struct {

    noCopy noCopy // ⽤于vet⼯具检查是否被复制
    // 64位的值：⾼32位是计数器，低32位是等待的goroutine数量。
    // 通过原⼦操作访问，保存了状态和等待者数量。

    state atomic.Uint64
    // ⽤于等待者休眠的信号量。

    sema uint32
    }

noCopy: 这是⼀个特殊的字段，⽤于静态分析⼯具（go vet）在编译时检查WaitGroup实例是否被复制。
WaitGroup被复制后会导致状态不⼀致，可能引发程序错误，因此该字段的存在旨在防⽌此类问题的发⽣。
state: 这是WaitGroup的核⼼，⼀个64位的⽆符号整型，通过sync/atomic包进⾏原⼦操作，以保证并发安全。这
个64位的空间被巧妙地分成了两部分：
⾼32位: 作为计数器（counter），记录了需要等待的 goroutine 的数量。
低32位: 作为等待者计数器（waiter count），记录了调⽤Wait()⽅法后被阻塞的 goroutine 的数量。
sema: 这是⼀个信号量，⽤于实现 goroutine 的阻塞和唤醒。当主 goroutine 调⽤Wait()⽅法且计数器不为零时，
它会通过这个信号量进⼊休眠状态。当所有⼦ goroutine 完成任务后，会通过这个信号量来唤醒等待的主
goroutine。

### 5.10 讲讲sync.Map的底层原理


sync.Map的底层核⼼是"空间换时间"，通过两个Map（read和dirty）** 的冗余结构，实现"读写分离"，最终达到
针对特定场景的"读"操作⽆锁优化。
它的read是⼀个只读的map，提供⽆锁的并发读取，速度极快。写操作则会先操作⼀个加了锁的、可读写的dirty
map。当dirty map的数据积累到⼀定程度，或者read map中没有某个key时，sync.Map会将dirty map⾥的数
据"晋升"并覆盖掉旧的read map，完成⼀次数据同步。
分析：
sync.Map的结构定义

    type Map struct {
    mu Mutex // ⽤于保护dirty字段的锁
    read atomic.Value // 只读字段，其实际的数据类型是⼀个readOnly结构
    dirty map[interface{}]*entry //需要加锁才能访问的map，其中包含在read中除了被expunged(删除)

以外的所有元素以及新加⼊的元素

    misses int // 计数器，记录在从read中读取数据的时候，没有命中的次数，当misses值等于dirty⻓度时，

dirty提升为read

    }

read字段的类型是atomic.Value，但是在使⽤中⾥⾯其实存储的是readOnly结构，readOnly结构定义如下：

    // readOnly is an immutable struct stored atomically in the Map.read field.
    type readOnly struct {

    m map[interface{}]*entry // key为任意可⽐较类型，value为entry指针
    amended bool // amended为true，表明dirty中包含read中没有的数据，为false表明dirty中的数据在

read中都存在

    }

entry这个结构:

    type entry struct {

    p unsafe.Pointer // p指向真正的value所在的地址
    }

![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0045_img00.png)

### 5.11 read map和dirty map之间有什么关联？


它们之间是"只读缓存"和"最新全集"的关联。

    read map是dirty map的⼀个不完全、且可能是过期的只读快照。dirty map则包含了所有的最新数据。

具体来说，read map中的所有数据，在dirty map⾥⼀定存在。⼀个key如果在read map⾥，那它的value要么就
是最终值，要么就是⼀个特殊指针，指向dirty map⾥对应的条⽬。⽽dirty map⾥有，read map⾥却可能没有，
因为dirty是最新、最全的。
当dirty map积累了⾜够多的新数据后，它会"晋升"为新的read map，旧的read map则被废弃。这个过程，就完
成了"缓存"的更新。

### 5.12 为什么要设计nil和expunged两种删除状态？


设计nil和expunged这两个状态，是为了解决在sync.Map的"读写分离"架构下，如何⾼效、⽆锁地处理"删除"操
作。
因为read map本⾝是只读的，我们不能直接从中删除⼀个key。所以，当⽤户调⽤Delete时，如果这个key只存在
于read map中，系统并不会真的删除它，⽽是将它的值标记为⼀个特殊的"已删除"状态，这个状态就是
expunged。后续的读操作如果看到这个expunged标记，就知道这个key其实已经不存在了，直接返回nil,
false。
⽽nil则是⼀个中间状态，主要⽤于dirty map和read map的同步过程，表⽰这个key正在被删除或迁移。
简单来说，这两个状态就像是在只读的read map上打的"逻辑删除"补丁。它避免了因为⼀次Delete操作就引发加锁
和map的整体复制，把真正的物理删除延迟到了dirty map"晋升"为read map的那⼀刻，是典型的⽤状态标记来换
取⽆锁性能的设计。

### 5.13 sync.Map 适⽤的场景？


sync.Map适合读多写少的场景，⽽不是和写多读少的场景。
因为我们期望将更多的流量在read map这⼀层进⾏拦截，从⽽避免加锁访问dirty map
对于更新，删除，读取，read map可以尽量通过⼀些原⼦操作，让整个操作变得⽆锁化，这样就可以避免进⼀步加
锁访问dirty map。倘若写操作过多，sync.Map 基本等价于⼀把互斥锁 + map，其读写效率会⼤⼤下降
6. Context⾯试题

### 6.1 Go语⾔⾥的Context是什么？


go语⾔⾥的context实际上是⼀个接⼜，提供了Deadline()，Done()，Err()以及Value()四种⽅法。它在Go 1.7 标准库
被引⼊。
它本质上是⼀个信号传递和范围控制的⼯具。它的核⼼作⽤是在⼀个请求处理链路中（跨越多个函数和
goroutine），优雅地传递取消信号（cancellation）、超时（timeout）和截⽌⽇期（deadline），并能携带⼀些范
围内的键值对数据。
分析

    type Context interface {
    Deadline() (deadline time.Time, ok bool) // Deadline⽅法的第⼀个返回值表示还有多久到

期， 第⼆个返回值代表是否被超时时间控制

    Done() <-chan struct{} // Done() 返回⼀个 只读channel，当这个channel被关闭时，说明这个

context被取消

    Err() error // Err() 返回⼀个错误，表示channel被关闭的原因，例如是被取消，还是超时关闭
    Value(key interface{}) interface{}) // value⽅法返回指定key对应的value，这是context携带

的值

    }

这个接⼜定义了四个核⼼⽅法，它们共同构成了⼀套关于截⽌时间、取消信号和请求范围值的协定：

    Deadline() - 返回⼀个时间点，告知任务何时应该被取消。
    Done() - 返回⼀个channel，当Context被取消或超时，这个channel会被关闭。这是goroutine监听取消信号

的核⼼。

    Err() - 在Done()的channel关闭后，它会解释关闭的原因，是主动取消（Canceled）还是超时

（DeadlineExceeded）。

    Value() - 允许Context在调⽤链中携带请求范围的键值对数据。

### 6.2 Go语⾔的Context有什么作⽤？


Go的Context主要解决三个核⼼问题：超时控制、取消信号传播和请求级数据传递


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0047_img00.png)


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0047_img01.png)


在实际项⽬中，我们最常⽤的是超时控制。⽐如⼀个HTTP请求需要调⽤多个下游服务，我们通过
context.WithTimeout设置整体超时时间，当超时发⽣时，所有⼦操作都会收到取消信号并⽴即退出，避免资源浪
费。取消信号的传播是通过Context的层级结构实现的，⽗Context取消时，所有⼦Context都会⾃动取消。
另外Context还能传递请求级的元数据，⽐如⽤户ID、请求ID等，这在分布式链路追踪中特别有⽤。需要注意的
是，Context应该作为函数的第⼀个参数传递，不要存储在结构体中，并且传递的数据应该是请求级别的，不要滥
⽤。

### 6.3 Context.Value的查找过程是怎样的


Context.Value的查找过程是⼀个链式递归查找的过程，从当前Context开始，沿着⽗Context链⼀直向上查找直到找
到对应的key或者到达根Context。
具体流程是：当调⽤ctx.Value(key)时，⾸先检查当前Context是否包含这个key，如果当前层没有，就会调⽤

    parent.Value(key)继续向上查找。这个过程会⼀直递归下去，直到找到匹配的key返回对应的value，或者查找到

根Context返回nil。

### 6.4 Context如何被取消


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0048_img00.png)


Context的取消是通过channel关闭信号实现的，主要有三种取消⽅式。
⾸先是主动取消，通过context.WithCancel创建的Context会返回⼀个cancel函数，调⽤这个函数就会关闭内部的

    done channel，所有监听这个Context的goroutine都能通过ctx.Done()收到取消信号。

其次是超时取消，context.WithTimeout和context.WithDeadline会启动⼀个定时器，到达指定时间后⾃动调⽤
cancel函数触发取消。
最后是级联取消，当⽗Context被取消时，所有⼦Context会⾃动被取消，这是通过Context树的结构实现的。
7. Interface⾯试题

### 7.1 Go语⾔中，interface的底层原理是怎样的？


Go的interface底层有两种数据结构：eface和iface。
eface是空interface{}的实现，只包含两个指针：_type指向类型信息，data指向实际数据。这就是为什么空接⼜能
存储任意类型值的原因，通过类型指针来标识具体类型，通过数据指针来访问实际值。
iface是带⽅法的interface实现，包含itab和data两部分。itab是核⼼，它存储了接⼜类型、具体类型，以及⽅法
表。⽅法表是个函数指针数组，保存了该类型实现的所有接⼜⽅法的地址。
分析：
eface定义：

    type eface struct {
    _type *_type
    data unsafe.Pointer
    }

![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0049_img00.png)


iface定义：

    type iface struct {
    tab *itab
    data unsafe.Pointer
    }

其中itab的结构定义如下：

    type itab struct {
    inter *interfacetype
    _type *_type
    hash uint32 // copy of _type.hash. Used for type switches.

_ [4]byte
fun [1]uintptr // variable sized. fun[0]==0 means _type does not implement inter.

    }


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0050_img00.png)

### 7.2 iface和eface的区别是什么？


iface和eface的核⼼区别在于是否包含⽅法信息。
eface是空接⼜interface{}的底层实现，结构⾮常简单，只有两个字段：_type指向类型信息，data指向实际数据。
因为空接⼜没有⽅法约束，所以不需要存储⽅法相关信息。
iface是⾮空接⼜的底层实现，结构相对复杂，包含itab和data。关键是这个itab，它不仅包含类型信息，还包含
了⼀个⽅法表，存储着该类型实现的所有接⼜⽅法的函数指针。

### 7.3 类型转换和断⾔的区别是什么？


类型转换、类型断⾔本质都是把⼀个类型转换成另外⼀个类型。不同之处在于，类型断⾔是对接⼜变量进⾏的操作。
对于类型转换⽽⾔，类型转换是在编译期确定的强制转换，转换前后的两个类型要相互兼容才⾏，语法是

    T(value)。⽽类型断⾔是运⾏期的动态检查，专门⽤于从接⼜类型中提取具体类型，语法是value.(T)

安全性差别很⼤：类型转换在编译期保证安全性，⽽类型断⾔可能在运⾏时失败。所以实际开发中更常⽤安全版本
的类型断⾔value, ok := x.(string)，通过ok判断是否成功。
使⽤场景不同：类型转换主要解决数值类型、字符串、切⽚等之间的转换问题；类型断⾔主要⽤于接⼜编程，当你
拿到⼀个interface{}需要还原成具体类型时使⽤。
底层实现也不同：类型转换通常是简单的内存重新解释或者数据格式调整；类型断⾔需要检查接⼜的底层类型信
息，涉及到runtime的类型系统。

### 7.4 Go语⾔interface有哪些应⽤场景


Go语⾔的interface主要有⼏个核⼼应⽤场景：
1. 依赖注⼊和解耦。通过定义接⼜抽象，让⾼层模块不依赖具体实现，⽐如定义⼀个UserRepo接⼜，具体可以
是MySQL、Redis或者Mock实现。这样代码更容易测试和维护，也符合SOLID原则。
2. 多态实现。⽐如定义⼀个Shape接⼜包含Area()⽅法，不同的图形结构体实现这个接⼜，就能⽤统⼀的⽅式
处理各种图形。这让代码更加灵活和可扩展。
3. 标准库中⼤量使⽤interface来提供统⼀API。像io.Reader、io.Writer让⽂件、⽹络连接、字符串等都能
⽤统⼀的⽅式操作；sort.Interface让任意类型都能使⽤标准库的排序算法。
4. 还有类型断⾔和反射的配合使⽤，⽐如JSON解析、ORM映射等场景，先⽤interface{}接收任意类型，再
通过类型断⾔或反射处理具体逻辑。
5. 插件化架构也heavily依赖interface。⽐如Web框架的中间件、数据库驱动、⽇志组件等，都通过接⼜定义规
范，让第三⽅能够轻松扩展功能。

### 7.5 接⼜之间可以相互⽐较吗？


1. 接⼜值之间可以使⽤ ==和 !＝来进⾏⽐较。两个接⼜值相等仅当它们都是nil值，或者它们的动态类型相同并
且动态值也根据这个动态类型的==操作相等。如果两个接⼜值的动态类型相同，但是这个动态类型是不可⽐
较的（⽐如切⽚），将它们进⾏⽐较就会失败并且panic。
2. 接⼜值在与⾮接⼜值⽐较时，Go会先将⾮接⼜值尝试转换为接⼜值，再⽐较。
3. 接⼜值很特别，其它类型要么是可⽐较类型（如基本类型和指针）要么是不可⽐较类型（如切⽚，映射类
型，和函数），但是接⼜值视具体的类型和值，可能会报出潜在的panic。
分析：
接⼜类型和 nil 作⽐较
接⼜值的零值是指动态类型和动态值都为 nil。当仅且当这两部分的值都为 nil 的情况下，这个接⼜值就才会被认为
接⼝值 == nil。

    package main
    import "fmt"
    type Coder interface {

    code()
    }
    type Gopher struct {

    name string
    }
    func (g Gopher) code() {

    fmt.Printf("%s is coding\n", g.name)
    }


    func main() {
    var c Coder

    fmt.Println(c == nil)
    fmt.Printf("c: %T, %v\n", c, c)
    var g *Gopher
    fmt.Println(g == nil)
    c = g
    fmt.Println(c == nil)
    fmt.Printf("c: %T, %v\n", c, c)
    }

程序输出：
true

    c: <nil>, <nil>

true
false

    c: *main.Gopher, <nil>

⼀开始，c 的 动态类型和动态值都为 nil，g 也为 nil，当把 g 赋值给 c 后，c 的动态类型变成了 *main.Gopher，
仅管 c 的动态值仍为 nil，但是当 c 和 nil 作⽐较的时候，结果就是 false 了。
8. 反射⾯试题

### 8.1 什么是反射？


反射是指计算机程序在运⾏时（Run time）可以访问、检测和修改它本⾝状态或⾏为的⼀种能⼒。⽤⽐喻来说，反
射就是程序在运⾏的时候能够"观察"并且修改⾃⼰的⾏为。

### 8.2 Go语⾔如何实现反射？


Go语⾔反射是通过接⼜来实现的，⼀个接⼜变量包含两个指针结构：⼀个指针指向类型信息，另⼀个指针指向实际
的数据。当我们将⼀个具体类型的变量赋值给⼀个接⼜时，Go就会把这个变量的类型信息和数据地址都存到这个接
⼜变量⾥。
有了这个前提，Go语⾔就可以通过再由reflect包的Type和ValueOf这两个函数读取接⼜变量⾥的类型信息和数据
信息。把这些内部信息"解包"成可供我们检查和操作的对象，完成在运⾏时对程序本⾝的动态访问和修改

### 8.3 Go语⾔中的反射应⽤有哪些


JSON序列化是最常见的应⽤，像encoding/json包通过反射动态获取结构体字段信息，实现任意类型的序列化和
反序列化。这也是为什么我们能直接⽤json.Marshal处理各种⾃定义结构体的原因。
ORM框架是另⼀个重点应⽤，⽐如GORM通过反射分析结构体字段，⾃动⽣成SQL语句和字段映射。它能动态读
取struct tag来确定数据库字段名、约束等信息，⼤⼤简化了数据库操作。
Web框架的参数绑定也⼤量使⽤反射，像Gin框架的ShouldBind⽅法，能够根据请求类型⾃动将HTTP参数绑定到
结构体字段上，这背后就是通过反射实现的类型转换和赋值。
还有配置⽂件解析、RPC调⽤、测试框架等场景。⽐如Viper配置库⽤反射将配置映射到结构体，gRPC通过反射实
现服务注册和⽅法调⽤。

### 8.4 如何⽐较两个对象完全相同


最直接的是⽤reflect.DeepEqual，这是标准库提供的深度⽐relatively⽅法，能递归⽐较结构体、切⽚、map等复合
类型的所有字段和元素。⽐如reflect.DeepEqual(obj1, obj2)，它会逐层⽐较内部所有数据，包括指针指向的
值。
对于简单类型可以直接⽤==操作符，但这只适合基本类型、数组、结构体等可⽐较类型。需要注意slice、map、
function这些类型是不能直接⽤==⽐较的，会编译报错。
实际项⽬中更推荐⾃定义Equal⽅法，根据业务需求定义相等的标准。⽐如对于⽤户对象，可能只需要⽐较ID和关
键字段，⽽不需要⽐较时间戳这种辅助字段。这样既提⾼了性能，又符合业务语义。
9. GMP⾯试题

### 9.1 Go语⾔的GMP模型是什么？


GMP是Go运⾏时的核⼼调度模型
GMP含义：G是goroutine协程；M是machine系统线程，真正⼲活的；P是processor，逻辑处理器，它是G和M之
间的桥梁。它负责调度G
调度逻辑是这样的，M必须绑定P才能执⾏G。每个P维护⼀个⾃⼰的本地G队列（长度256），M从P的本地队列取
G执⾏。当本地队列空时，M会按优先级从全局队列、⽹络轮询器、其他P队列中窃取goroutine，这是work-
stealing机制。
就是这个模型让Go能在少量线程上调度海量goroutine，是Go⾼并发的基础。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0054_img00.png)

### 9.2 什么是Go scheduler

    Go scheduler就是Go运⾏时的协程调度器，负责在系统线程上调度执⾏goroutine。它 是 Go runtime 的⼀部分，它

内嵌在 Go 程序⾥，和 Go 程序⼀起运⾏。它的主要⼯作是决定哪个goroutine在哪个线程上运⾏，以及何时进⾏上
下⽂切换。scheduler的核⼼是schedule()函数，它在⽆限循环中寻找可运⾏的goroutine。当找到后通过

    execute()函数切换到goroutine执⾏，goroutine主动让出或被抢占时再回到调度循环。

### 9.3 Go语⾔在进⾏goroutine调度的时候，调度策略是怎样的？


Go语⾔采⽤的是抢占式调度策略。Go 会启动⼀个线程，⼀直运⾏着"sysmon"函数，sysmon 运⾏在 M上，且不需
要P。当 sysmon 发现 M 已运⾏同⼀个 G（Goroutine）10ms 以上时，它会将该 G 的内部参数 preempt 设置为
true，表⽰需要被抢占，让出CPU了。只是在Go 1.14之前和Go 1.14之后有所不同


Go 1.14之前：调度策略是"协作式"抢占调度，这种调度⽅式主要是通过函数调⽤来实现的，在编译期，编译器会在
⼏乎所有的函数调⽤的⼊⼜处，插⼊⼀⼩段检查代码。这段代码会检查当前goroutine是否已经被标记为需要被抢
占。如果是，当 G 进⾏函数调⽤时，G 会检查⾃⼰的 preempt 标志，如果它为 true，则它将⾃⼰与 M 分离并推⼊
goroutine的全局队列，抢占完成。但这种模式有个明显的缺陷：如果⼀个goroutine执⾏了⼀个不包含任何函数调
⽤的超⼤循环，那么调度器的"抢占"标记就永远得不到检查，这个goroutine就会⼀直霸占着M，导致同⼀个P队列
⾥的其他G全都没机会执⾏，造成调度延迟。
Go 1.14之后：调度策略基于信号的异步抢占机制，sysmon 会检测到运⾏了 10ms 以上的 G（goroutine）。然后，
sysmon 向运⾏ G 的 M发送信号（SIGURG）。Go 的信号处理程序会调⽤M上的⼀个叫作 gsignal 的 goroutine 来
处理该信号，并使其检查该信号。gsignal 看到抢占信号，停⽌正在运⾏的 G。

### 9.4 发⽣调度的时机有哪些？


等待读取或写⼊未缓冲的通道
由于 time.Sleep() ⽽等待
等待互斥量释放
发⽣系统调⽤

### 9.5 M寻找可运⾏G的过程是怎样的？


M会优先检查本地队列（LRQ）：从当前P的LRQ⾥runqget⼀个G。（⽆锁CAS），如果本地队列没有可运⾏G，
再次检查全局队列（GRQ）去全局队列⾥globrunqget找。（需要加锁）；如果还没有，就检查⽹络轮询器
（netpoll），就去netpoll⾥看看有没有因为⽹络IO就绪的G。（⾮阻塞模式），依然没有获取到可运⾏G，则会
从别的P偷（steal work），这个偷的过程是随机找⼀个别的P，从它的LRQ⾥偷⼀半的G过来。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0056_img00.png)

### 9.6 GMP能不能去掉P层？会怎么样？


GMP中的P层理论上可以去掉，但会带来严重的性能问题。
掉P的后果：如果直接变成GM模型，所有M都需要从全局队列中获取goroutine，这就需要全局锁保护。在⾼并发
场景下，⼤量M争抢同⼀把锁会造成严重的锁竞争，CPU⼤部分时间都浪费在等锁上，调度效率急剧下降。
P层的价值：P的存在实现了⽆锁的本地调度。每个P维护独⽴的本地队列，M绑定P后可以直接从本地队列取G执
⾏，⼤部分情况下都不需要全局锁。只有本地队列空了才去偷取，这⼤⼤减少了锁竞争。

### 9.7 P和M在什么时候会被创建？


P的创建时机：P在调度器初始化时⼀次性创建。在schedinit()函数中会调⽤procresize()，根据GOMAXPROCS值
创建对应数量的P对象，存储在全局的allp数组中。之后P的数量基本固定，只有在调⽤runtime.GOMAXPROCS()动
态调整时才会重新分配P。
M的创建时机：M采⽤按需创建策略。初始只有m0存在，当出现以下情况时会创建新的M：


![图解](A:/CS-Base/%E5%B0%8F%E6%9E%97%E5%85%AB%E8%82%A1%E9%9D%A2%E8%AF%95%E9%A2%98%E6%B1%87%E6%80%BB/markdown/images_golang/page0057_img00.png)


所有现有M都在执⾏阻塞的系统调⽤，但还有可运⾏的goroutine需要执⾏
通过startm()函数发现没有空闲M可以绑定P执⾏goroutine
M的数量受GOMAXTHREADS限制，默认10000个
创建流程：新M通过newm()函数创建，它会调⽤newosproc()创建新的系统线程，并为这个M分配独⽴的g0。创建
完成后，新M会进⼊mstart()开始调度循环。

### 9.8 m0是什么，有什么⽤


m0是在Go启动时创建的第⼀个M，m0对应程序启动时的主系统线程，它在Go程序的整个⽣命周期中都存在。与其
他通过runtime.newm()动态创建的M不同，m0是在程序初始化阶段静态分配的，有专门的全局变量存储。
m0主要负责执⾏Go程序的启动流程，包括调度器初始化、内存管理器初始化、垃圾回收器设置等。它会创建并运
⾏第⼀个⽤户goroutine来执⾏main.main函数。在程序运⾏期间，m0也参与正常的goroutine调度，和其他M没有
本质区别。m0在程序退出时还负责处理清理⼯作，⽐如等待其他goroutine结束、执⾏defer函数等。

### 9.9 g0是⼀个怎样的协程，有什么⽤？


g0是⼀个特殊的goroutine，不是普通的⽤户协程，⽽是调度协程，每个M都有⾃⼰的g0。它使⽤系统线程的原始栈
空间，⽽不是像普通goroutine那样使⽤可增长的分段栈。g0的栈⼤⼩通常是8KB，⽐普通goroutine的2KB初始栈要
⼤。
核⼼作⽤：g0专门负责执⾏调度逻辑，包括goroutine的创建、销毁、调度决策等。当M需要进⾏调度时，会从当前
运⾏的⽤户goroutine切换到g0上执⾏schedule()函数。g0还负责处理垃圾回收、栈扫描、信号处理等运⾏时操
作。
运⾏机制：正常情况下M在⽤户goroutine上运⾏⽤户代码，当发⽣调度事件时（如goroutine阻塞、抢占、系统调
⽤返回等），M会切换到g0执⾏调度器代码，选出下⼀个要运⾏的goroutine后再切换过去。


为什么需要g0：因为调度器代码不能在普通goroutine的栈上执⾏，那样会有栈空间冲突和递归调度的问题。g0提供
了⼀个独⽴的执⾏环境，确保调度器能安全稳定地⼯作。

### 9.10 g0栈和⽤户栈是如何进⾏切换的？


g0和⽤户goroutine之间的栈切换，本质是SP寄存器和栈指针的切换。当⽤户goroutine需要调度时，通过mcall()
函数切换到g0。这个过程会保存当前⽤户goroutine的PC、SP等寄存器到其gobuf中，然后将SP指向g0的栈，PC指
向传⼊的调度函数。调度完成后，通过gogo()函数从g0切换回⽤户goroutine，恢复其保存的寄存器状态。
切换逻辑在汇编⽂件中实现，⽐如runtime·mcall和runtime·gogo。这些函数直接操作CPU寄存器，确保切换的
原⼦性和⾼效性。切换过程中会更新g.sched字段记录goroutine状态。
分析：
goroutine的结构如下：

    structG
    {
    uintptr stackguard; // 分段栈的可⽤空间下界
    uintptr stackbase; // 分段栈的栈基址
    Gobuf sched; //协程切换时，利⽤sched域来保存上下⽂
    uintptr stack0;

FuncVal* fnstart; // goroutine运⾏的函数void* param; // ⽤于传递参
数，睡眠时其它goroutine设置param，唤醒时此goroutine可以获取

    int16 status; // 状态 Gidle,Grunnable,Grunning,Gsyscall,Gwaiting,Gdead
    int64 goid; // goroutine的id号

G* schedlink;
M* m; // for debuggers, but offset not hard-coded
M* lockedm; // G被锁定只能在这个m上运⾏

    uintptr gopc; // 创建这个goroutine的go表达式的pc...

};
10. 内存管理⾯试题

### 10.1 讲讲Go语⾔是如何分配内存的？


Go语⾔的内存分配采⽤了TCMalloc算法的改进版本，核⼼是分级分配和本地缓存。
分配器架构：Go内存分配有三个层级：mcache（线程缓存）、mcentral（中央缓存）、mheap（页堆）。每个P都
有独⽴的mcache，避免了锁竞争；mcentral按对象⼤⼩分类管理；mheap负责从操作系统申请⼤块内存。
对象分类分配：根据对象⼤⼩分为三类处理：
微⼩对象（<16字节）：在mcache的tiny分配器中分配，多个微⼩对象可以共享⼀个内存块
⼩对象（16字节-32KB）：通过size class机制，预定义了67种⼤⼩规格，优先从P的mcache对应的mspan中
分配，如果 mcache 没有内存，则从 mcentral 获取，如果 mcentral 也没有，则向 mheap 申请，如果
mheap 也没有，则从操作系统申请内存。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0059_img00.png)


⼤对象（>32KB）：直接从mheap分配，跨越多个页⾯

### 10.2 知道 golang 的内存逃逸吗？什么情况下会发⽣内存逃逸？


内存逃逸是编译器在程序编译时期根据逃逸分析策略，将原本应该分配到栈上的对象分配到堆上的⼀个过程
主要逃逸场景：
返回局部变量指针：函数返回内部变量的地址，变量必须逃逸到堆上

    interface{}类型：传递给interface{}参数的具体类型会逃逸，因为需要运⾏时类型信息

闭包引⽤外部变量：被闭包捕获的变量会逃逸到堆上
切⽚/map动态扩容：当容量超出编译期确定范围时会逃逸
⼤对象：超过栈⼤⼩限制的对象直接分配到堆上

### 10.3 内存逃逸有什么影响？


因为堆对象需要垃圾回收机制来释放内存，栈对象会跟随函数结束被编译器回收，所以⼤量的内存逃逸会给gc带来
压⼒

### 10.4 Channel是分配在栈上，还是堆上？


channel分配在堆上，Channel 被设计⽤来实现协程间通信的组件，其作⽤域和⽣命周期不可能仅限于某个函数内
部，所以 ⼀般情况下golang 直接将其分配在堆上

### 10.5 Go语⾔在什么情况下会发⽣内存泄漏？


以下是⼀些内存泄漏的场景场景：
goroutine泄漏：这是最常见的泄漏场景。goroutine没有正常退出会⼀直占⽤内存，⽐如从channel读取数据但
channel永远不会有数据写⼊，或者死循环没有退出条件。我在项⽬中遇到过，启动了处理任务的goroutine但没有
合适的退出机制，导致随着请求增加goroutine越来越多。
channel泄漏：未关闭的channel和等待channel的goroutine会相互持有引⽤。⽐如⽣产者已经结束但没有关闭
channel，消费者goroutine会⼀直阻塞等待，造成内存⽆法回收。
slice引⽤⼤数组：当slice引⽤⼀个⼤数组的⼩部分时，整个底层数组都⽆法被GC回收。解决⽅法是使⽤copy创建
新的slice。
map元素过多：map中删除元素只是标记删除，底层bucket不会缩减。如果map曾经很⼤后来元素减少，内存占⽤
仍然很⾼。
定时器未停⽌：time.After或time.NewTimer创建的定时器如果不⼿动停⽌，会在heap中持续存在。
循环引⽤：虽然Go的GC能处理循环引⽤，但在某些复杂场景下仍可能出现问题。

### 10.6 Go语⾔发⽣了内存泄漏如何定位和优化？


定位⼯具：
pprof：最重要的⼯具，通过go tool pprof http://localhost:port/debug/pprof/heap分析堆内存分
布，go tool pprof http://localhost:port/debug/pprof/goroutine分析goroutine泄漏
trace⼯具：go tool trace可以看到goroutine的⽣命周期和阻塞情况
runtime统计：通过runtime.ReadMemStats()监控内存使⽤趋势，runtime.NumGoroutine()监控协程数
量
定位⽅法：我通常先看内存增长曲线，如果内存持续上涨不回收，就⽤pprof分析哪个函数分配内存最多。如果是
goroutine泄漏，会看到goroutine数量异常增长，然后分析这些goroutine阻塞在哪⾥。
常见优化⼿段：
goroutine泄漏：使⽤context设置超时，确保goroutine有退出机制，避免⽆限阻塞
channel泄漏：及时关闭channel，使⽤select+default避免阻塞
slice引⽤优化：对⼤数组的⼩slice使⽤copy创建独⽴副本
定时器清理：⼿动调⽤timer.Stop()释放资源
11. 垃圾回收⾯试题

### 11.1 常见的 GC 实现⽅式有哪些？


所有的 GC 算法其存在形式可以归结为追踪（Tracing）GC和引⽤计数（Reference Counting）这两种形式的混合
运⽤。


⽬前⽐较常见的实现⽅式有：
标记清扫：从根对象出发，将确定存活的对象进⾏标记，并清扫可以回收的对象。
标记整理：为了解决内存碎⽚问题⽽提出，在标记过程中，将对象尽可能整理到⼀块连续的内存上。
增量式：将标记与清扫的过程分批执⾏，每次执⾏很⼩的部分，从⽽增量的推进垃圾回收，达到近似实时、
⼏乎⽆停顿的⽬的。
增量整理：在增量式的基础上，增加对对象的整理过程。
分代式：将对象根据存活时间的长短进⾏分类，存活时间⼩于某个值的为年轻代，存活时间⼤于某个值的为
⽼年代，永远不会参与回收的对象为永久代。并根据分代假设（如果⼀个对象存活时间不长则倾向于被回
收，如果⼀个对象已经存活很长时间则倾向于存活更长时间）对对象进⾏回收。
引⽤计数：根据对象⾃⾝的引⽤计数来回收，当引⽤计数归零时⽴即回收。

### 11.2 Go 语⾔的 GC 使⽤的是什么？


Go 的 GC ⽬前使⽤的是⽆分代（对象没有代际之分）、不整理（回收过程中不对对象进⾏移动与整理）、并发
（与⽤户代码并发执⾏）的三⾊标记清扫算法。

### 11.3 三⾊标记法是什么？


三⾊标记法是Go垃圾回收器使⽤的核⼼算法
三⾊定义：
⽩⾊：未被访问的对象，垃圾回收结束后⽩⾊对象会被清理
灰⾊：已被访问但其引⽤对象还未完全扫描的对象，是待处理队列
⿊⾊：已被访问且其所有引⽤对象都已扫描完成的对象，确认存活
标记流程：GC开始时所有对象都是⽩⾊，从GC Root（全局变量、栈变量等）开始将直接可达对象标记为灰⾊。然
后不断从灰⾊队列中取出对象，扫描其引⽤的对象：如果引⽤对象是⽩⾊就标记为灰⾊，当前对象所有引⽤扫描完
成后标记为⿊⾊。重复这个过程直到灰⾊队列为空。
分析：


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0062_img00.png)


当垃圾回收开始时，只有⽩⾊对象。随着标记过程开始进⾏时，灰⾊对象开始出现（着⾊），这时候波⾯便开始扩
⼤。当⼀个对象的所有⼦节点均完成扫描时，会被着⾊为⿊⾊。当整个堆遍历完成时，只剩下⿊⾊和⽩⾊对象，这
时的⿊⾊对象为可达对象，即存活；⽽⽩⾊对象为不可达对象，即死亡。这个过程可以视为以灰⾊对象为波⾯，将
⿊⾊对象和⽩⾊对象分离，使波⾯不断向前推进，直到所有可达的灰⾊对象都变为⿊⾊对象为⽌的过程。如上图所
⽰

### 11.4 Go语⾔GC的根对象到底是什么？


根对象在垃圾回收的术语中又叫做根集合，它是垃圾回收器在标记过程时最先检查的对象，包括：
1. 全局变量：程序在编译期就能确定的那些存在于程序整个⽣命周期的变量。
2. 执⾏栈：每个 goroutine 都包含⾃⼰的执⾏栈，这些执⾏栈上包含栈上的变量及指向分配的堆内存区块的指
针。
3. 寄存器：寄存器的值可能表⽰⼀个指针，参与计算的这些指针可能指向某些赋值器分配的堆内存区块。

### 11.5 STW 是什么意思？


STW 是 Stop the World 的缩写，通常意义上指的是⽤户代码被完全停⽌运⾏，STW 越长，对⽤户代码造成的影响
（例如延迟）就越⼤，早期 Go 对垃圾回收器的实现中 STW 长达⼏百毫秒，对时间敏感的实时通信等应⽤程序会造
成巨⼤的影响。


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0063_img00.png)

### 11.6 并发标记清除法的难点是什么？


并发标记清除法的核⼼难点在于如何保证在⽤户程序并发修改对象引⽤时，垃圾回收器仍能正确识别存活对象。
主要难点：
对象消失问题：在标记过程中，如果⽤户程序删除了从⿊⾊对象到⽩⾊对象的引⽤，同时从灰⾊对象到该⽩
⾊对象的引⽤也被删除，这个⽩⾊对象就会被错误回收，但它实际上还是可达的
新对象处理：标记期间新分配的对象如何着⾊？如果标记为⽩⾊可能被误回收，标记为⿊⾊可能造成浮动垃
圾
以如下例⼦来分析：
时
序 回收器 赋值器 ｜说明

### 1 shade(A, 回收器：根对象的⼦节点着⾊为灰⾊对象


gray)

### 2 shade(C, 回收器：当所有⼦节点着⾊为灰⾊后，将节点着为⿊⾊


black)

### 3 C.ref3 = 赋值器：并发的修改了 C 的⼦节点


C.ref2.ref1

### 4 A.ref1 = 赋值器：并发的修改了 A 的⼦节点

    nil

### 5 shade(A.ref1, 回收器：进⼀步灰⾊对象的⼦节点并着⾊为灰⾊对象，这时由于 A.ref1 为


gray) nil，什么事情也没有发⽣

### 6 shade(A, 回收器：由于所有⼦节点均已标记，回收器也不会重新扫描已经被标记为⿊⾊


black) 的对象，此时 A 被着⾊为⿊⾊，scan(A) 什么也不会发⽣，进⽽ B 在此次回收
过程中永远不会被标记为⿊⾊，进⽽错误地被回收
初始状态：假设某个⿊⾊对象 C 指向某个灰⾊对象 A ，⽽ A 指向⽩⾊对象 B；
C.ref3 = C.ref2.ref1：赋值器并发地将⿊⾊对象 C 指向（ref3）了⽩⾊对象 B；
A.ref1 = nil：移除灰⾊对象 A 对⽩⾊对象 B 的引⽤（ref2）；
最终状态：在继续扫描的过程中，⽩⾊对象 B 永远不会被标记为⿊⾊对象了（回收器不会重新扫描⿊⾊对
象），进⽽对象 B 被错误地回收。

### 11.7 Go语⾔是如何解决并发标记清除时，⽤户程序并发修改对象引⽤问


题的？
Go通过写屏障技术和三⾊不变性维护来解决这个并发安全问题。
核⼼挑战是防⽌"对象消失"现象：当⿊⾊对象新增对⽩⾊对象的引⽤，同时灰⾊到⽩⾊的引⽤被删除时，⽩⾊对象
可能被错误回收。Go采⽤混合写屏障策略，在指针赋值时执⾏额外逻辑：新建引⽤时将⽬标对象着为灰⾊，删除引
⽤时将被删对象标为灰⾊，这样确保关键对象不会丢失在标记过程中。
同时Go维护了弱三⾊不变性：允许⿊⾊对象指向⽩⾊对象，但要保证从⽩⾊对象出发存在全灰⾊路径可达根对象。
栈操作因为频繁且开销敏感，没有采⽤写屏障结束，⽽是做了特殊处理：标记开始和结束时分别扫描栈，中间过程
不加写屏障。
这套机制让Go实现了微秒级STW时间，⼤部分GC⼯作都与⽤户程序并发执⾏，在保证回收正确性的同时将性能影
响降到最低。

### 11.8 什么是写屏障、混合写屏障，如何实现？


写屏障的本质是在编译器在指针赋值操作中插⼊的额外很短的指令，当执⾏*slot = ptr这样的指针赋值时，写屏
障会在赋值前后执⾏特定逻辑来标记相关对象，防⽌并发标记过程中对象被错误回收。
⾸先Dijkstra插⼊写屏障在建⽴新引⽤时将⽬标对象标为灰⾊，但删除引⽤时⽆保护；Yuasa删除写屏障在删除引⽤
时将原对象标为灰⾊，但新建引⽤时⽆保护。两者各有局限性
Go 1.8后采⽤的混合写屏障，结合两者优点，在堆上在建⽴新引⽤和删除引⽤时分别采⽤插⼊写屏障和删除写屏障
的做法。但同时他会做了优化，它不再需要STW去重扫了。它的新规则是，任何在GC标记阶段，被创建于栈上的
新对象，默认都标记为⿊⾊。这样⼀来，GC就不需要关⼼栈上的指针指向堆⾥的哪个⽩⾊对象了，因为栈本⾝就
被看作是⿊⾊的，它指向的对象必须是可达的。

### 11.9 Go 语⾔中 GC 的流程是什么？


阶段 说明 赋值器状态
SweepTermination 清扫终⽌阶段，为下⼀个阶段的并发标记做准备⼯作，启动写屏障 STW
Mark 扫描标记阶段，与赋值器并发执⾏，写屏障开启 并发
MarkTermination 标记终⽌阶段，保证⼀个周期内标记任务完成，停⽌写屏障 STW
GCoff 内存清扫阶段，将需要回收的内存归还到堆中，写屏障关闭 并发
GCoff 内存归还阶段，将过多的内存归还给操作系统，写屏障关闭 并发
分析：
具体⽽⾔，各个阶段的触发函数分别为：


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0065_img00.png)

### 11.10 GC触发的时机有哪些？


1. 主动触发，通过调⽤ runtime.GC() 来触发 GC，此调⽤阻塞式地等待当前 GC 运⾏完毕。
2. 被动触发，分为两种⽅式：
go后台有⼀系统监控线程，当超过两分钟没有产⽣任何 GC 时，强制触发 GC。
内存使⽤增长⼀定⽐例时有可能会触发，每次内存分配时检查当前内存分配量是否已达到阈值（环境
变量GOGC）：默认100%，即当内存扩⼤⼀倍时启⽤GC
我们可以通过debug.SetGCPercent(500)来修改步调，这⾥表⽰，如果当前堆⼤⼩超过了上次
标记的堆⼤⼩的500%，就会触发
⽽第⼀次GC的触发的临界值是4MB

### 11.11 GC 关注的指标有哪些？


CPU 利⽤率：回收算法会在多⼤程度上拖慢程序？有时候，这个是通过回收占⽤的 CPU 时间与其它 CPU
时间的百分⽐来描述的。
GC 停顿时间：回收器会造成多长时间的停顿？⽬前的 GC 中需要考虑 STW 和 Mark Assist 两个部分可能造
成的停顿。
GC 停顿频率：回收器造成的停顿频率是怎样的？⽬前的 GC 中需要考虑 STW 和 Mark Assist 两个部分可能
造成的停顿。
GC 可扩展性：当堆内存变⼤时，垃圾回收器的性能如何？但⼤部分的程序可能并不⼀定关⼼这个问题。

### 11.12 有了 GC，为什么还会发⽣内存泄露？


有GC机制的话，内存泄漏其实是预期的能很快被释放的内存其⽣命期意外地被延长，导致预计能够⽴即回收的内
存⽽长时间得不到回收。
Go⽤语⾔主要有以下两种：
1. 内存被根对象引⽤⽽没有得到迅速释放 ，⽐如某个局部变量被赋值到了⼀个全局变量map中
2. goroutine 泄漏，⼀些不当的使⽤，导致goroutine不能正常退出，也会造成内存泄漏

### 11.13 Go 的 GC 如何调优？


1. 合理化内存分配的速度、提⾼赋值器的 CPU 利⽤率
2. 降低并复⽤已经申请的内存 ，⽐如使⽤sync.pool复⽤经常需要创建的重复对象
3. 调整 GOGC ，可以适量将 GOGC 的值设置得更⼤，让 GC 触发的时间变得更晚，从⽽减少其触发频率，进
⽽增加⽤户代码对机器的使⽤率

### 11.14 如何观察 Go GC？


主要有以下⼏种⽅式：

    package main
    func allocate() {

    _ = make([]byte, 1<<20)
    }
    func main() {
    for n := 1; n < 100000; n++ {

    allocate()
    }
    }

⽅式⼀：GODEBUG=gctrace=1
我们⾸先可以通过
$ go build -o main

    $ GODEBUG=gctrace=1 ./main
    gc 1 @0.000s 2%: 0.009+0.23+0.004 ms clock, 0.11+0.083/0.019/0.14+0.049 ms cpu, 4->6->2

MB, 5 MB goal, 12 P

    scvg: 8 KB released
    scvg: inuse: 3, idle: 60, sys: 63, released: 57, consumed: 6 (MB)


    gc 2 @0.001s 2%: 0.018+1.1+0.029 ms clock, 0.22+0.047/0.074/0.048+0.34 ms cpu, 4->7->3

MB, 5 MB goal, 12 P

    scvg: inuse: 3, idle: 60, sys: 63, released: 56, consumed: 7 (MB)
    gc 3 @0.003s 2%: 0.018+0.59+0.011 ms clock, 0.22+0.073/0.008/0.042+0.13 ms cpu, 5->6->1

MB, 6 MB goal, 12 P

    scvg: 8 KB released
    scvg: inuse: 2, idle: 61, sys: 63, released: 56, consumed: 7 (MB)
    gc 4 @0.003s 4%: 0.019+0.70+0.054 ms clock, 0.23+0.051/0.047/0.085+0.65 ms cpu, 4->6->2

MB, 5 MB goal, 12 P

    scvg: 8 KB released
    scvg: inuse: 3, idle: 60, sys: 63, released: 56, consumed: 7 (MB)
    scvg: 8 KB released
    scvg: inuse: 4, idle: 59, sys: 63, released: 56, consumed: 7 (MB)
    gc 5 @0.004s 12%: 0.021+0.26+0.49 ms clock, 0.26+0.046/0.037/0.11+5.8 ms cpu, 4->7->3

MB, 5 MB goal, 12 P

    scvg: inuse: 5, idle: 58, sys: 63, released: 56, consumed: 7 (MB)
    gc 6 @0.005s 12%: 0.020+0.17+0.004 ms clock, 0.25+0.080/0.070/0.053+0.051 ms cpu, 5->6-

>1 MB, 6 MB goal, 12 P

    scvg: 8 KB released
    scvg: inuse: 1, idle: 62, sys: 63, released: 56, consumed: 7 (MB)

在这个⽇志中可以观察到两类不同的信息：

    gc 1 @0.000s 2%: 0.009+0.23+0.004 ms clock, 0.11+0.083/0.019/0.14+0.049 ms cpu, 4->6->2

MB, 5 MB goal, 12 P

    gc 2 @0.001s 2%: 0.018+1.1+0.029 ms clock, 0.22+0.047/0.074/0.048+0.34 ms cpu, 4->7->3

MB, 5 MB goal, 12 P
以及

    scvg: 8 KB released
    scvg: inuse: 3, idle: 60, sys: 63, released: 57, consumed: 6 (MB)
    scvg: inuse: 3, idle: 60, sys: 63, released: 56, consumed: 7 (MB)

对于⽤户代码向运⾏时申请内存产⽣的垃圾回收：

    gc 2 @0.001s 2%: 0.018+1.1+0.029 ms clock, 0.22+0.047/0.074/0.048+0.34 ms cpu, 4->7->3

MB, 5 MB goal, 12 P
含义由下表所⽰：


字段 含义
gc 2 第⼆个 GC 周期

### 0.001 程序开始后的 0.001 秒


2% 该 GC 周期中 CPU 的使⽤率

### 0.018 标记开始时， STW 所花费的时间（wall clock）

### 1.1 标记过程中，并发标记所花费的时间（wall clock）

### 0.029 标记终⽌时， STW 所花费的时间（wall clock）

### 0.22 标记开始时， STW 所花费的时间（cpu time）

### 0.047 标记过程中，标记辅助所花费的时间（cpu time）

### 0.074 标记过程中，并发标记所花费的时间（cpu time）

### 0.048 标记过程中，GC 空闲的时间（cpu time）

### 0.34 标记终⽌时， STW 所花费的时间（cpu time）

### 4 标记开始时，堆的⼤⼩的实际值

### 7 标记结束时，堆的⼤⼩的实际值

### 3 标记结束时，标记为存活的对象⼤⼩

### 5 标记结束时，堆的⼤⼩的预测值

### 12 P 的数量

    wall clock 是指开始执⾏到完成所经历的实际时间，包括其他程序和本程序所消耗的时间； cpu time 是指特定

程序使⽤ CPU 的时间； 他们存在以下关系：

    wall clock < cpu time: 充分利⽤多核
    wall clock ≈ cpu time: 未并⾏执⾏
    wall clock > cpu time: 多核优势不明显

对于运⾏时向操作系统申请内存产⽣的垃圾回收（向操作系统归还多余的内存）：

    scvg: 8 KB released
    scvg: inuse: 3, idle: 60, sys: 63, released: 57, consumed: 6 (MB)

含义由下表所⽰：


字段 含义

### 8 KB released 向操作系统归还了 8 KB 内存

### 3 已经分配给⽤户代码、正在使⽤的总内存⼤⼩ (MB)

### 60 空闲以及等待归还给操作系统的总内存⼤⼩（MB）

### 63 通知操作系统中保留的内存⼤⼩（MB）

### 57 已经归还给操作系统的（或者说还未正式申请）的内存⼤⼩（MB）

### 6 已经从操作系统中申请的内存⼤⼩（MB）


⽅式⼆：go tool trace

    go tool trace 的主要功能是将统计⽽来的信息以⼀种可视化的⽅式展⽰给⽤户。要使⽤此⼯具，可以通过调⽤
    trace API：
    package main
    func main() {

    f, _ := os.Create("trace.out")
    defer f.Close()
    trace.Start(f)
    defer trace.Stop()

(...)

    }

并通过
$ go tool trace trace.out
2019/12/30 15:50:33 Parsing trace...
2019/12/30 15:50:38 Splitting trace...
2019/12/30 15:50:45 Opening browser. Trace viewer is listening on http://127.0.0.1:51839
来启动可视化界⾯：


![图解](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/page0070_img00.png)


⽅式三：debug.ReadGCStats
此⽅式可以通过代码的⽅式来直接实现对感兴趣指标的监控，例如我们希望每隔⼀秒钟监控⼀次 GC 的状态：

    func printGCStats() {
    t := time.NewTicker(time.Second)
    s := debug.GCStats{}
    for {

    select {
    case <-t.C:
    debug.ReadGCStats(&s)
    fmt.Printf("gc %d last@%v, PauseTotal %v\n", s.NumGC, s.LastGC,

s.PauseTotal)

    }
    }
    }
    func main() {

    go printGCStats()

(...)

    }

我们能够看到如下输出：
$ go run main.go

    gc 4954 last@2019-12-30 15:19:37.505575 +0100 CET, PauseTotal 29.901171ms
    gc 9195 last@2019-12-30 15:19:38.50565 +0100 CET, PauseTotal 77.579622ms
    gc 13502 last@2019-12-30 15:19:39.505714 +0100 CET, PauseTotal 128.022307ms
    gc 17555 last@2019-12-30 15:19:40.505579 +0100 CET, PauseTotal 182.816528ms
    gc 21838 last@2019-12-30 15:19:41.505595 +0100 CET, PauseTotal 246.618502ms

⽅式四：runtime.ReadMemStats
除了使⽤ debug 包提供的⽅法外，还可以直接通过运⾏时的内存相关的 API 进⾏监控：

    func printMemStats() {
    t := time.NewTicker(time.Second)
    s := runtime.MemStats{}
    for {

    select {
    case <-t.C:
    runtime.ReadMemStats(&s)
    fmt.Printf("gc %d last@%v, next_heap_size@%vMB\n", s.NumGC,
    time.Unix(int64(time.Duration(s.LastGC).Seconds()), 0), s.NextGC/(1<<20))
    }
    }
    }
    func main() {

    go printMemStats()

(...)

    }

$ go run main.go

    gc 4887 last@2019-12-30 15:44:56 +0100 CET, next_heap_size@4MB
    gc 10049 last@2019-12-30 15:44:57 +0100 CET, next_heap_size@4MB
    gc 15231 last@2019-12-30 15:44:58 +0100 CET, next_heap_size@4MB
    gc 20378 last@2019-12-30 15:44:59 +0100 CET, next_heap_size@6MB

12. Go代码⾯试题

### 12.1 开启100个协程，顺序打印1-1000，且保证协程号1的，打印尾数为1


的数字

    // 同时开启100个协程(分别为1号协程 2号协程 ... 100号协程，
    // 1号协程只打印尾数为1的数字，2号协程只打印尾数为2的数，
    // 以此类推)，请顺序打印1-1000整数以及对应的协程号；
    func main() {

    s := make(chan struct{})
    //通过map的key来保证协程的顺序

    m := make(map[int]chan int, 100)
    //填充map,初始化channel
    for i := 1; i <= 100; i++ {

m[i] = make(chan int)

    }
    //开启100个协程，死循环打印
    //go func() { 这个协程不加也可以的
    for i := 1; i <= 100; i++ {


    go func(id int) {
    for {
    num := <-m[id]
    fmt.Println(num)
    s <- struct{}{}
    }

}(i)

    }
    //}()
    //循环1-1000，并把值传递给匹配的map
    //然后通过s限制循序打印
    for i := 1; i <= 1000; i++ {

    id := i % 100
    if id == 0 {

    id = 100
    }

m[id] <- i

    //通过s这个来控制打印顺序。每次遍历⼀次i
    //都通过s阻塞协程的打印，最后打印完毕

    <-s
    }

    time.Sleep(10 * time.Second)
    }

### 12.2 三个goroutinue交替打印abc 10次

    package main
    import (

"fmt"
"sync"
)

    func main() {
    // 定义3个channel

    ch1 := make(chan struct{})
    ch2 := make(chan struct{})
    ch3 := make(chan struct{})
    var wg sync.WaitGroup

    wg.Add(3)
    // 打印a
    go func() {
    defer wg.Done()
    for i := 0; i < 10; i++ {
    <-ch1
    fmt.Println("a")
    ch2 <- struct{}{}
    }
    // 第10次的时候，打印c的goroutine写⼊了ch1
    // 为了防⽌阻塞，要消费以下ch1


    <-ch1
    }()
    // 打印b
    go func() {
    defer wg.Done()
    for i := 0; i < 10; i++ {
    <-ch2
    fmt.Println("b")
    ch3 <- struct{}{}
    }

    }()
    // 打印c
    go func() {
    defer wg.Done()
    for i := 0; i < 10; i++ {
    <-ch3
    fmt.Println("c")
    ch1 <- struct{}{}
    }

    }()
    // 启动
    ch1 <- struct{}{}
    wg.Wait()
    close(ch1)
    close(ch2)
    close(ch3)
    fmt.Println("end")
    }

### 12.3 ⽤不超过10个goroutine不重复的打印slice中的100个元素

    package main
    import (

"fmt"
"sync"
)

    // ⽤不超过10个goroutine不重复的打印slice中的100个元素
    // 容量为10的有缓冲channel实现
    // 每次启动10个，累计启动100个goroutine,且⽆序打印
    func main() {
    var wg sync.WaitGroup
    // 创建切⽚

    ss := make([]int, 100)
    for i := 0; i < 100; i++ {

ss[i] = i

    }

    ch := make(chan struct{}, 10)
    for i := 0; i < 100; i++ {
    wg.Add(1)


    ch <- struct{}{}
    // 写10个就阻塞了，此时goroutine中打印
    go func(idx int) {
    defer wg.Done()
    fmt.Printf("val: %d \n", ss[idx])
    // 打印结束，从缓冲channel中删除⼀个
    <-ch

}(i)

    }

    wg.Wait()
    // 关闭channel
    close(ch)
    fmt.Println("end")
    }
    // ⽤不超过10个goroutine不重复的打印slice中的100个元素
    // 创建10个⽆缓冲channel和10个goroutine
    // 固定10个goroutine,且顺序打印
    func test9() {
    var wg sync.WaitGroup
    // 创建切⽚

    ss := make([]int, 100)
    for i := 0; i < 100; i++ {

ss[i] = i

    }
    // 创建channel和goroutine

    hashMap := make(map[int]chan int)
    sort := make(chan struct{})
    for i := 0; i < 10; i++ {

hashMap[i] = make(chan int)

    wg.Add(1)
    go func(idx int) {
    defer wg.Done()
    for val := range hashMap[idx] {
    fmt.Printf("go id: %d, val: %d \n", idx, val)
    sort <- struct{}{}
    }

}(i)

    }
    // 循环切⽚，对10取模，找到对应channel的key，写⼊值
    for _, v := range ss {

    id := v % 10

hashMap[id] <- v

    // 有序

    <-sort
    }
    // 循环结束关闭channel,删除map的key
    for k, _ := range hashMap {

    close(hashMap[k])
    delete(hashMap, k)
    }
    wg.Wait()
    close(sort)
    fmt.Println("end")


    }

### 12.4 两个协程交替打印奇偶数

    package main
    import (

"fmt"
"time"
)

    func main() {
    //golang交替打印奇偶数
    //交替打印，可以通过channel来实现

    chan1 := make(chan struct{})
    //偶数

    go func() {
    for i := 0; i < 10; i++ {

    chan1 <- struct{}{}
    if i%2 == 0 {

    fmt.Println("打印偶数:", i)
    }
    }

    }()
    //奇数

    go func() {
    for i := 0; i < 10; i++ {

    <-chan1
    if i%2 == 1 {

    fmt.Println("打印奇数数:", i)
    }
    }

    }()
    //阻塞

    select {
    case <-time.After(time.Second * 10):
    }
    }

### 12.5 ⽤单个channel实现0,1的交替打印

    package main
    import (

"fmt"
"time"
)

    func main() {
    msg := make(chan struct{})
    go func() {
    for {
    <-msg
    fmt.Println("0")
    msg <- struct{}{}
    }
    }()
    go func() {
    for {
    <-msg
    fmt.Println("1")
    msg <- struct{}{}
    }
    }()
    msg <- struct{}{}
    time.Sleep(3 * time.Minute)
    }

### 12.6 sync.Cond实现多⽣产者多消费者

    package main
    import (

"context"
"fmt"

    "math/rand"

"sync"
"time"
)

    func main() {
    var wg sync.WaitGroup
    var cond sync.Cond

    cond.L = new(sync.Mutex)
    msgCh := make(chan int, 5)
    ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
    defer cancel()
    rand.Seed(time.Now().UnixNano())
    // ⽣产者
    producer := func(ctx context.Context, out chan<- int, idx int) {
    defer wg.Done()
    for {

    select {
    case <-ctx.Done():
    // 每次⽣产者退出，都唤醒⼀个消费者处理，防⽌最后有消费者线程死锁
    // ⽣产者⽐消费者多，所以cond.Signal()就可以。不然的话建议Broadcast()


    cond.Broadcast()
    fmt.Println("producer finished")
    return
    default:
    cond.L.Lock()

    for len(msgCh) == 5 {

    cond.Wait()
    }
    num := rand.Intn(500)
    out <- num
    fmt.Printf("producer: %d, msg: %d\n", idx, num)
    cond.Signal()
    cond.L.Unlock()
    }
    }
    }
    // 消费者

    consumer := func(ctx context.Context, in <-chan int, idx int) {
    defer wg.Done()
    for {

    select {
    case <-ctx.Done():
    // 消费者可以选择继续消费直到channel为空
    for len(msgCh) > 0 {

    select {
    case num := <-in:
    fmt.Printf("consumer %d, msg: %d\n", idx, num)
    default:
    // 如果channel已经空了，跳出循环

    break
    }
    }

    fmt.Println("consumer finished")
    return
    default:
    cond.L.Lock()
    for len(msgCh) == 0 {

    cond.Wait()
    }
    num := <-in
    fmt.Printf("consumer %d, msg: %d\n", idx, num)
    cond.Signal()
    cond.L.Unlock()
    }
    }
    }
    // 启动⽣产者和消费者
    for i := 0; i < 5; i++ {

    wg.Add(1)
    go producer(ctx, msgCh, i+1)
    }
    for i := 0; i < 3; i++ {

    wg.Add(1)


    go consumer(ctx, msgCh, i+1)
    }
    // 模拟程序运⾏⼀段时间

    wg.Wait()
    close(msgCh)
    fmt.Println("all finished")
    }

### 12.7 使⽤go实现1000个并发控制并设置执⾏超时时间1秒

    package main
    import ("context"

"fmt"
"sync"
"time"
)

    func main() {
    // 创建 1000 个协程，并且进⾏打印
    // 总共超时时间 1s，1s 没执⾏完就超时，使⽤ ctx 进⾏控制
    // 定义任务 chan
    neltasks := make(chan int, 1000)
    // 定义 ctx
    ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
    defer cancel()
    var wg sync.WaitGroup
    // 启动 1000 个协程
    for i := 0; i < 1000; i++ {
    wg.Add(1)
    tasks <- i
    go func(id int) {
    defer wg.Done()
    select {
    case <-ctx.Done():
    return
    default:
    fmt.Printf("goroutine id: %d\n", id)
    }

}(i)

    }
    <-ctx.Done()
    fmt.Println("exec done")
    close(tasks)
    wg.Wait()
    fmt.Println("finish")
    }

### 12.8 使⽤两个Goroutine，向标准输出中按顺序按顺序交替打出字母与数


字，输出是a1b2c3

    package main
    import ("fmt"

"sync"
)

    func main() {
    // 定义两个channel，⼀个打印数字，⼀个打印字⺟
    numCh := make(chan struct{})
    strCh := make(chan struct{})
    var wg sync.WaitGroup
    wg.Add(2)
    // 打印字符
    go func() {
    defer wg.Done()
    for i := 'a'; i <= 'z'; i++ {
    fmt.Println(string(i))
    // 通知打印数字
    numCh <- struct{}{}
    // 阻塞等待打印字⺟
    <-strCh
    }
    }()
    // 打印字⺟
    go func() {
    defer wg.Done()
    for i := 1; i <= 26; i++ {
    <-numCh
    fmt.Println(i)
    // 通知打印字⺟
    strCh <- struct{}{}
    }
    }()
    wg.Wait()
    fmt.Println("finished")
    }

### 12.9 编写⼀个程序限制10个goroutine执⾏，每执⾏完⼀个goroutine就放


⼀个新的goroutine进来

    package main

import 
("fmt"
"sync"
)

    // 编写⼀个程序限制10个goroutine执⾏，每执⾏完⼀个goroutine就放⼀个新的goroutine进来
    func main() {
    var wg sync.WaitGroup
    ch := make(chan struct{}, 10)
    for i := 0; i < 20; i++ {
    wg.Add(1)
    ch <- struct{}{}
    go func(id int) {
    defer wg.Done()
    fmt.Println("id: %d", id)
    <-ch

}(i)

    }
    wg.Wait()
    }
