//update design to use JS6 symbols and other idioms; add instanceOf method; remove defPrivate machinery; add optional ctor instantiation in eval's code block that includes class name for easier debugging

(function(factory){
	if(typeof define != "undefined"){
		define(["../defClass", "smoke", "chai"], factory);
	}else if(typeof module != "undefined"){
		module.exports = factory(require("../defClass"), require("smoke"), require("chai"));
	}else{
		factory(defClass, smoke, chai);
	}
})(function(defClass, smoke, chai){
	"use strict";

	let assert = chai.assert;

	// define a toy class hierarchy that includes three the base classes B, M1, and M2
	// and then the subclass S, which is derived from B, M1, and M2

	let B = defClass(function(){
		return {
			[defClass.statics]: {
				[defClass.className]: "B"
			},

			constructor(value){
				this._dataB = value;
			},

			methodOfB(){
				return "method from B interface";
			},

			methodClash(){
				return "clash method in B"
			},

			get somePublicDataOfB(){
				return this._dataB;
			},

			set somePublicDataOfB(value){
				this._dataB = value;
			}
		}
	});

	let M1 = defClass(function(){
		return {
			[defClass.statics]: {
				[defClass.className]: "M1"
			},

			constructor(value){
				this.dataM1 = value;
			},

			methodOfM1(){
				return "method from M1 interface";
			},

			methodClash(){
				return "clash method in M1"
			},

			get somePublicDataOfM1(){
				return this.dataM1;
			},

			set somePublicDataOfM1(value){
				this.dataM1 = value;
			}
		}
	});

	let M2 = defClass(function(){
		return {
			[defClass.statics]: {
				[defClass.className]: "M2",
				private: ["privateDataExample"]
			},

			constructor(value){
				this.dataM2 = value;
			},

			methodOfM2(){
				return "method from M2 interface";
			},

			methodClash(){
				return "clash method in M2"
			},

			get somePublicDataOfM2(){
				return this.dataM2;
			},

			set somePublicDataOfM2(value){
				this.dataM2 = value;
			}
		}
	});

	let S = defClass(B, [M1, M2], function(B, M1, M2){
		return {
			[defClass.statics]: {
				[defClass.className]: "S"
			},

			constructor(value){
				B.constructor.call(this, "B+" + value);
				M1.constructor.call(this, "M1+" + value);
				M2.constructor.call(this, "M2+" + value);
				this.dataS = value;
			},

			methodOfS(){
				return "method from S interface";
			},

			methodClash(){
				return B.methodClash.call(this) + "-" +
					M1.methodClash.call(this) + "-" +
					M2.methodClash.call(this) + "-" +
					"clash method in S"
			},

			get somePublicDataOfS(){
				return this.dataS;
			},

			set somePublicDataOfS(value){
				this.dataS = value;
			}
		};
	});

	smoke.defTest({
		id: "defClass",
		tests: [
			["the basics", function(){
				// S is a constructor function
				let s = new S("s-value");

				// an instance of S is also an instance of S, M1, M2, and B
				assert(s.instanceOf(S));
				assert(s.instanceOf(M1));
				assert(s.instanceOf(M2));
				assert(s.instanceOf(B));

				// the new instance is S was fully initialized by calling the constructors of S, M1, M2, and B
				assert(s.somePublicDataOfS == "s-value");
				assert(s.somePublicDataOfM1 == "M1+s-value");
				assert(s.somePublicDataOfM2 == "M2+s-value");
				assert(s.somePublicDataOfB == "B+s-value");

				// the interface defined on s includes all the interfaces of S, M1, M2, B
				assert(s.methodOfS() == "method from S interface");
				assert(s.methodOfM1() == "method from M1 interface");
				assert(s.methodOfM2() == "method from M2 interface");
				assert(s.methodOfB() == "method from B interface");

				// when a name collision offers, the subclass must define how to handle the collision
				assert(s.methodClash() == "clash method in B-clash method in M1-clash method in M2-clash method in S");
			}],
			["static members", function(){
				assert(S[defClass.className] == "S");
				assert(M1[defClass.className] == "M1");
				assert(M2[defClass.className] == "M2");
				assert(B[defClass.className] == "B");
			}],
			["access to base classes", function(){
				assert(S[defClass.super] === B);
				assert.deepEqual(S[defClass.mixins], {M1: M1, M2: M2});
			}]
		]

	})
});

