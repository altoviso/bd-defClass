(function(factory){
	if(typeof define != "undefined"){
		define([], factory);
	}else if(typeof module != "undefined"){
		module.exports = factory();
	}else{
		defClass = factory();
	}
})(function(){
	"use strict";
	let STATICS = Symbol("defClass-statics"),
		CLASS_NAME = Symbol("defClass-class-name"),
		NONMIXIN_MEMBER = Symbol("defClass-nonmixin-member"),
		CONSTRUCTOR = Symbol("defClass-constructor"),
		SUPER = Symbol("defClass-super"),
		MIXINS = Symbol("defClass-mixins");

	function traversePrototypeChain(prototype, proc){
		if(prototype && prototype !== Object.prototype){
			proc(prototype);
			traversePrototypeChain(Object.getPrototypeOf(prototype));
		}
	}

	function defineProperty(src, dest, propertyId){
		let value = src[propertyId];
		if(typeof value === "object" && value != null){
			Object.defineProperty(src, propertyId, value);
		}else{
			Object.defineProperty(dest, propertyId, Object.getOwnPropertyDescriptor(src, propertyId));
		}
	}

	function generate0(className){
		return eval(`
				let ${className} = function(){};
				${className};`);
	}
	function generate1(className, initializer){
		return eval(`
				let ${className} = function(){
					let result = initializer.call(this, ...arguments);
					if(result){
						return result;
					}
				};
				${className};`);
	}
	function generate2(className, initializers, initializersCount){
		return eval(`
				let ${className} = function(){
					let result = this;
					for(let i = 0; i < ${initializersCount}; i++){
						result = initializers[i].call(result, ...arguments) || this;
					}
					if(result !== this){
						return result;
					}
				${className};`);
	}

	function defClass(superClass, // constructor function; optional
					  mixins,     // array of {constructor function | hash | pair of [name, {constructor function | hash}]}; optional
					  members     // members factory function | hash; required
	){
		// juggle...
		if(!members){
			if(!mixins){
				// one argument...
				members = superClass;
				superClass = mixins = null;
			}else{
				// two arguments
				if(typeof superClass === "function"){
					// superClass and members
					members = mixins;
					mixins = null;
				}else if(Array.isArray(superClass)){
					// mixins and members
					members = mixins;
					mixins = superClass;
					superClass = null;
				}
			}
		}// else three args

		// pull the prototypes of the mixins and figure out mixin names and replace all [name, mixin] in mixins with mixin
		let mixinCtors = [],
			mixinPrototypes = [],
			mixinNames = [];
		if(mixins){
			mixins = mixins.map(function(mixin, mixinIndex){
				let name;
				if(Array.isArray(mixin)){
					name = mixin[0];
					mixin = mixin[1];
				}
				if(typeof mixin === "function"){
					// mixin is a constructor function
					mixinCtors.push(mixin);
					mixinPrototypes.push(mixin.prototype);
					mixinNames.push(name || mixin[CLASS_NAME] || ("mixin#" + mixinIndex));
				}else{
					// mixin is a hash of methods and data definitions
					// optionally, the hash may include a function at property==="constructor" which is
					// used to initialize data that is operated upon by the mixin instances
					mixin.constructor && mixinCtors.push(mixin.constructor);
					mixinPrototypes.push(mixin);
					mixinNames.push(name || (mixin[STATICS] && mixin[STATICS][CLASS_NAME]) || ("mixin#" + mixinIndex));
				}
				return mixin;
			});
		}

		// if members is a factory, then compute the members...
		if(typeof members === "function"){
			members = members.apply(null, superClass ? [superClass.prototype].concat(mixinPrototypes) : mixinPrototypes);
		}

		let ctor = null,
			prototype = superClass ? Object.create(superClass.prototype) : {},
			className = null,
			statics = null,
			interfaceCatalog = {};
		Object.getOwnPropertyNames(members).forEach(function(p){
			interfaceCatalog[p] = NONMIXIN_MEMBER;
			let value = members[p];
			if(p === "constructor"){
				ctor = value;
			}else{
				defineProperty(members, prototype, p);
			}
		});
		Object.getOwnPropertySymbols(members).forEach(function(p){
			interfaceCatalog[p] = NONMIXIN_MEMBER;
			if(p === STATICS){
				statics = members[STATICS];
				className = statics[CLASS_NAME] || "";
			}else{
				defineProperty(members, prototype, p);
			}
		});

		// populate interfaceCatalog with any names in the prototype chain
		traversePrototypeChain(Object.getPrototypeOf(prototype), function(prototype){
			Object.getOwnPropertyNames(prototype).forEach(function(p){
				interfaceCatalog[p] = NONMIXIN_MEMBER;
			});
			Object.getOwnPropertySymbols(members).forEach(function(p){
				interfaceCatalog[p] = NONMIXIN_MEMBER;
			});
		});


		// augment the prototype with the interface(s) of the mixin(s)
		mixinPrototypes.forEach(function(mixin, mixinIndex){
			let seen = {};
			traversePrototypeChain(mixin, function(mixinPrototype){
				function processMixinMember(p){
					if(seen[p] || p == "constructor") return;
					seen[p] = true;
					if(!interfaceCatalog[p]){
						interfaceCatalog[p] = mixinNames[mixinIndex];
						defineProperty(mixinPrototype, prototype, p);
					}else if(interfaceCatalog[p] !== NONMIXIN_MEMBER){
						// this interface name has already been defined by another mixin; therefore, there is a clash
						throw("mixin name clash: name=" + p + "; mixin " + interfaceCatalog[p] + " and mixin " + mixinNames[mixinIndex]);
					}// else interfaceCatalog[p]===NONMIXIN_MEMBER and this slot was explicitly defined by members
				}

				Object.getOwnPropertyNames(mixinPrototype).forEach(processMixinMember);
				Object.getOwnPropertySymbols(mixinPrototype).forEach(processMixinMember);
			});
		});

		let constructor = ctor;

		if(!className || defClass.noEval){
			if(constructor){
				constructor = (function(constructor){
					return function(){
						let result = constructor.call(this, ...arguments);
						if(result){
							return result;
						}
					}
				})(constructor);
			}else{
				let initializers = (superClass ? [superClass] : []).concat(mixinCtors),
					initializersCount = initializers.length;
				if(initializersCount == 0){
					constructor = function(){
					}
				}else if(initializersCount == 1){
					let initializer = initializers[0];
					constructor = function(){
						let result = initializer.call(this, ...arguments);
						if(result){
							return result;
						}
					}
				}else{
					constructor = function(){
						let result = this;
						for(let i = 0; i < initializersCount; i++){
							result = initializers[i].call(result, ...arguments) || this;
						}
						if(result !== this){
							return result;
						}
					}
				}
			}
		}else{
			if(constructor){
				constructor = generate1(className, constructor);
			}else{
				let initializers = (superClass ? [superClass] : []).concat(mixinCtors),
					initializersCount = initializers.length;
				if(initializersCount == 0){
					constructor = generate0(className);
				}else if(initializersCount == 1){
					constructor = generate1(className, initializers[0]);
				}else{
					constructor = generate2(className, initializers, initializersCount);
				}
			}
		}
		//canonical...
		constructor.prototype = prototype;
		prototype.constructor = constructor;

		// decorate the constructor

		// this is our marker to say that the constructor is a defClass-created constructor
		Object.defineProperty(constructor, CONSTRUCTOR, {enumerable: true, value: true});

		// add the statics given by members
		if(statics){
			Object.getOwnPropertyNames(statics).forEach(function(propertyId){
				defineProperty(statics, constructor, propertyId)
			});
			Object.getOwnPropertySymbols(statics).forEach(function(propertyId){
				defineProperty(statics, constructor, propertyId)
			});
		}

		// remember the superClass class
		if(superClass){
			Object.defineProperty(constructor, SUPER, {enumerable: true, value: superClass});
		}

		// remember the mixins; this.constructor[defClass.mixins].A (this an instance of this class) points to the mixin with the name A
		let mixinsRef = {};
		mixinNames.forEach(function(name, i){
			mixinsRef[name] = mixins[i];
		});
		Object.defineProperty(constructor, MIXINS, {enumerable: true, value: mixinsRef});

		// provide instanceOf method that knows about the super class (if any) and mixins (if any)
		if(!members.instanceOf){
			prototype.instanceOf = function(target){
				return (this instanceof target) || (mixins && mixins.some(function(mixin){
						return target === mixin;
					}));
			}
		}

		// provide a factory method that provides automatic post-construction processing if and only if the method postCreate was defined
		if(prototype.postCreate && !constructor.factory){
			Object.defineProperty(constructor, "factory", {
				configurable: true, enumerable: true, value: function(){
					let result = new constructor(...arguments);
					result.postCreate(...arguments);
					return result;
				}
			});
		}

		return constructor;
	}

	defClass.statics = STATICS;
	defClass.className = CLASS_NAME;
	defClass.constructor = CONSTRUCTOR;
	defClass.super = SUPER;
	defClass.mixins = MIXINS;

	return defClass;
});
